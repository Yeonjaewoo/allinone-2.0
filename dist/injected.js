// ==UserScript==
// @name         Chzzk P2P Bypass
// @version      2.1.3.261012.1
// @description  Bypasses Grid (P2P), ads, anti-adblock popups, and quality limits.
// @author       NoCompromise
// @namespace    nocompromise
// @license      MIT
// @match        https://chzzk.naver.com/*
// @match        https://*.chzzk.naver.com/*
// @match        https://m.naver.com/shorts/*
// @grant        none
// @run-at       document-start
// @inject-into  page
// @sandbox      raw
// @downloadURL https://update.greasyfork.org/scripts/565645/Chzzk%20P2P%20Bypass.user.js
// @updateURL https://update.greasyfork.org/scripts/565645/Chzzk%20P2P%20Bypass.meta.js
// ==/UserScript==
(() => {
  "use strict";

  const SCRIPT_NAME = "Chzzk P2P Bypass";
  const VERSION = "2.1.3.261012.1";
  const PREFIX = `[${SCRIPT_NAME}]`;
  const INSTALL_MARKER = Symbol.for("chzzk-p2p-bypass.installed");
  const ADGUARD_FILTER_MARKER = Symbol.for("chzzk-filter.runtime");
  const root = globalThis;
  const IS_CLIP_FRAME = (() => {
    if (
      root.location?.hostname !== "m.naver.com" ||
      root.location.pathname !== "/shorts/" ||
      root.parent === root
    )
      return false;
    const params = new URLSearchParams(root.location.search);
    try {
      return (
        params.get("serviceType") === "CHZZK" &&
        params.get("embed") === "true" &&
        new URL(root.document.referrer).origin === "https://chzzk.naver.com"
      );
    } catch {
      return false;
    }
  })();
  if (root.location?.hostname === "m.naver.com" && !IS_CLIP_FRAME) return;

  const previousInstallation = root[INSTALL_MARKER];
  if (
    typeof previousInstallation === "string" ||
    previousInstallation?.status === "installing" ||
    previousInstallation?.status === "active"
  ) {
    return;
  }
  if (previousInstallation?.status === "failed") {
    delete root[INSTALL_MARKER];
  } else if (previousInstallation !== undefined) {
    throw new Error(`${PREFIX} installation marker collision.`);
  }

  const installation = Object.seal({
    failure: null,
    stage: "bootstrap",
    status: "installing",
    version: VERSION,
    startedAt: root.performance?.now?.() ?? null,
    documentReadyState: root.document?.readyState ?? null,
  });
  Object.defineProperty(root, INSTALL_MARKER, {
    configurable: true,
    value: installation,
  });

  const hasOwn = (value, key) =>
    Object.prototype.hasOwnProperty.call(value, key);
  const isObject = (value) => value !== null && typeof value === "object";
  const isRecord = (value) => isObject(value) && !Array.isArray(value);

  // Capture pristine functions before installing any hooks.
  const nativeJsonParse = JSON.parse;
  const nativeJsonStringify = JSON.stringify;
  const nativeAtob = root.atob?.bind(root);
  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
  const utf8Encoder = new TextEncoder();
  const enqueueMicrotask =
    typeof root.queueMicrotask === "function"
      ? root.queueMicrotask.bind(root)
      : (callback) => Promise.resolve().then(callback);

  // ========================================================
  // [ChzzkClean] 확장 프로그램 팝업 토글 설정 연동 브릿지
  // ========================================================
  const CLEAN_SETTINGS = {
    gridBypassEnabled: true,
    lowLatencyMode: true,
    targetLatency: 2.0,
    chatLatencyDisplay: true,
    autoAdSkip: true,
    autoDismissPopup: true,
  };

  try {
    const cachedSettings = root.localStorage?.getItem("chzzk_clean_settings");
    if (cachedSettings) {
      Object.assign(CLEAN_SETTINGS, JSON.parse(cachedSettings));
    }
  } catch (e) {}

  try {
    const domSettings = root.document?.documentElement?.getAttribute("data-chzzk-clean-settings");
    if (domSettings) {
      Object.assign(CLEAN_SETTINGS, JSON.parse(domSettings));
    }
  } catch (e) {}

  root.addEventListener("message", (e) => {
    if (e.data?.source === "CHZZK_CLEAN_EXT" && e.data?.type === "SETTINGS_UPDATED") {
      if (e.data.settings) {
        Object.assign(CLEAN_SETTINGS, e.data.settings);
        try {
          root.localStorage?.setItem("chzzk_clean_settings", JSON.stringify(CLEAN_SETTINGS));
        } catch (err) {}
        console.info(`${PREFIX} [ChzzkClean] 토글 설정 동기화 완료:`, CLEAN_SETTINGS);
        const style = document.getElementById("chzzk-p2p-bypass-style");
        if (style) {
          style.disabled = !CLEAN_SETTINGS.autoDismissPopup;
        }
      }
    }
  });

  // Windows 환경 네이버 플러그인 요구 원천 우회
  try {
    Object.defineProperty(navigator, "platform", {
      get: () => "MacIntel",
      configurable: true,
    });
    const originalUA = navigator.userAgent;
    if (originalUA.includes("Windows")) {
      const macUA = originalUA.replace(/Windows NT [0-9.]+; Win64; x64/i, "Macintosh; Intel Mac OS X 10_15_7");
      Object.defineProperty(navigator, "userAgent", {
        get: () => macUA,
        configurable: true,
      });
    }
    const pluginId = "ooadnieabchijkibjpeieeliohjidnjj";
    const wChrome = root.chrome;
    if (wChrome) {
      if (!wChrome.runtime) wChrome.runtime = {};
      const origSend = wChrome.runtime.sendMessage;
      wChrome.runtime.sendMessage = function (...args) {
        if (typeof args[0] === "string" && args[0].includes(pluginId)) {
          const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
          const mock = { installed: true, running: true, status: "RUNNING", version: "2.1.0", success: true };
          if (cb) { root.setTimeout(() => cb(mock), 0); return; }
          return Promise.resolve(mock);
        }
        return origSend ? origSend.apply(this, args) : Promise.resolve();
      };
    }
  } catch (e) {}

  const PLAYBACK_FIELDS = Object.freeze([
    "livePlaybackJson",
    "liveRewindPlaybackJson",
    "radioModePlaybackJson",
    "previewPlaybackJson",
    "playbackJson",
  ]);
  const PLAYBACK_FIELD_SET = new Set(PLAYBACK_FIELDS);
  const PLAYBACK_FIELD_PATTERN = /playbackJson$/i;
  const RESTRICTED_STATUSES = new Set([
    "PLAYABLE_LOW_RESOLUTION",
    "FORCE_LOW_RESOLUTION",
  ]);
  const TRUSTED_CDN_SUFFIXES = Object.freeze(["pstatic.net", "navercdn.com"]);
  const P2P_METADATA_KEYS = new Set([
    "p2p",
    "p2ppath",
    "p2ppathurlencoding",
    "p2pquality",
  ]);
  const EARLY_CONNECTION_ORIGINS = Object.freeze([
    "https://api.chzzk.naver.com",
    "https://chzzk-web-config.io.naver.com",
    "https://ssl.pstatic.net",
    "https://nvelop-livecloud.pstatic.net",
  ]);
  const TUNNEL_LABEL_PREFIX = utf8Encoder.encode("gfp-tunnel-response-");
  const TUNNEL_PROTOCOLS = Object.freeze([
    Object.freeze({
      aadLength: 40,
      algorithm: "AES-GCM",
      ivLength: 12,
      label: "gfp-tunnel-response-v1",
      labelBytes: utf8Encoder.encode("gfp-tunnel-response-v1"),
      tagLength: 128,
    }),
  ]);
  const MAX_TUNNEL_JSON_BYTES = 4 * 1024 * 1024;
  const PLAYBACK_REJECTION_EVENT = "AD_NOT_DISPLAYED";
  const PLAYBACK_ADVANCE_EVENT = "ui_ad_skip";
  const PLAYBACK_ROUTE = /^\/(?:live\/[0-9a-f]{32}|video\/\d+)(?:\/|$)/i;
  const stats = {
    jsonResponses: 0,
    lateStartupRecoveryAttempts: 0,
    lateStartupRecoveries: 0,
    startupRecoveryWindows: 0,
    startupRecoveryScans: 0,
    jsonTransformTimeMs: 0,
    responseTransformTimeMs: 0,
    tunnelDecrypts: 0,
    tunnelResponses: 0,
    tunnelTransformTimeMs: 0,
    maxTunnelTransformTimeMs: 0,
    tunnelFailures: 0,
    tunnelPassThroughs: 0,
    runtimeFailures: 0,
    jsonHookReleases: 0,
    directTracks: 0,
    adBlockFlags: 0,
    restrictions: 0,
    rejectedCdnUrls: 0,
    droppedTracks: 0,
    mockedAds: 0,
    blockedAdAudio: 0,
    blockedAdVolumeEvents: 0,
    blockedAdFailures: 0,
    advancedAds: 0,
    midrollCountdownsDetected: 0,
    midrollCountdownsAdvanced: 0,
    maxMidrollCountdownLatencyMs: 0,
    adAdvanceBindings: 0,
    adAdvanceAttempts: 0,
    nativeAdRateChanges: 0,
    nativeAdSeeks: 0,
    maxAdCompletionLatencyMs: 0,
    homeTopSkinAdsHidden: 0,
    preconnectHints: 0,
    bitrateLimitsRemoved: 0,
    integritySignals: 0,
    hookRollbacks: 0,
    hookRollbackConflicts: 0,
    runtimeIssues: 0,
    unsupportedTunnelProtocols: 0,
    startupPlayAttempts: 0,
    startupPlayRecoveries: 0,
    startupPlayRejections: 0,
    startupWarmupResumeAttempts: 0,
    startupWarmupResumeRejections: 0,
    stalePlaybackTasksPrevented: 0,
    mediaIntentCandidates: 0,
    mediaIntentPauseConfirmations: 0,
    mediaIntentRateConfirmations: 0,
    mediaIntentSeekConfirmations: 0,
    vodVolumeFocusRepairs: 0,
    playerPreferenceSaves: 0,
    playerPreferenceRestores: 0,
    temporaryPreferenceWritesPrevented: 0,
    clipKeyboardRepairs: 0,
    discoveredPlaybackFields: 0,
    unsupportedRestrictions: 0,
  };
  const failures = [];
  const issues = [];
  const playbackIncidents = [];
  const MAX_ISSUE_KEYS = 256;
  const issueKeys = new Set();
  const preconnectedOrigins = new Map();
  let playbackAdvanceListeners;
  let playbackAdvanceGeneration = 0;
  const lifecycleCallbacks = Object.seal({
    reconcileAuxiliaryVideos: () => {},
    reconcilePrimaryPlayback: () => {},
    releaseJsonFallback: () => {},
  });
  const userMediaIntents = new WeakMap();
  const PLAYER_SCOPE_SELECTOR = ".pzp";

  const monotonicNow =
    typeof root.performance?.now === "function"
      ? root.performance.now.bind(root.performance)
      : Date.now;
  function recordTime(totalKey, maxKey, startedAt) {
    const elapsed = monotonicNow() - startedAt;
    stats[totalKey] += elapsed;
    if (maxKey) {
      stats[maxKey] = Math.max(stats[maxKey], elapsed);
    }
  }

  function preconnectOrigin(candidate) {
    if (!root.document) {
      return;
    }
    const url = new URL(candidate, location.href);
    const origin = url.origin;
    if (preconnectedOrigins.has(origin)) {
      return;
    }
    const parent = document.head || document.documentElement;
    if (!parent) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    parent.append(link);
    preconnectedOrigins.set(origin, link);
    hookRegistry.addCleanup(`preconnect:${origin}`, () => {
      if (preconnectedOrigins.get(origin) === link) {
        preconnectedOrigins.delete(origin);
        link.remove();
      }
    });
    stats.preconnectHints += 1;
  }

  function reportFailure(stage, error) {
    const normalized =
      error instanceof Error
        ? error
        : new Error(String(error ?? "unknown error"));
    stats.runtimeFailures += 1;
    failures.push(
      Object.freeze({
        stage,
        name: normalized.name,
        message: normalized.message,
        at: new Date().toISOString(),
      }),
    );
    if (failures.length > 20) {
      failures.shift();
    }
    console.error(PREFIX, `${stage} failed`, normalized);
    return normalized;
  }

  function reportIssue(stage, error, key = stage) {
    if (issueKeys.has(key)) {
      return;
    }
    issueKeys.add(key);
    if (issueKeys.size > MAX_ISSUE_KEYS) {
      issueKeys.delete(issueKeys.values().next().value);
    }
    const normalized =
      error instanceof Error
        ? error
        : new Error(String(error ?? "unknown issue"));
    stats.runtimeIssues += 1;
    issues.push(
      Object.freeze({
        stage,
        name: normalized.name,
        message: normalized.message,
        at: new Date().toISOString(),
      }),
    );
    if (issues.length > 20) {
      issues.shift();
    }
    console.warn(PREFIX, `${stage}: ${normalized.message}`);
  }

  function summarizeMediaSource(video) {
    const source = video.currentSrc || video.src || "";
    if (!source || source.startsWith("blob:")) {
      return source ? "blob:" : "";
    }
    try {
      const url = new URL(source, root.location?.href);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return "invalid";
    }
  }

  function summarizeTimeRanges(ranges) {
    const result = [];
    for (let index = 0; index < ranges.length; index += 1) {
      result.push(
        Object.freeze({
          start: Number(ranges.start(index).toFixed(3)),
          end: Number(ranges.end(index).toFixed(3)),
        }),
      );
    }
    return Object.freeze(result);
  }

  function recordPlaybackIncident(type, video, detail = {}) {
    try {
      const incident = Object.freeze({
        type,
        route: currentPlaybackRoute(),
        source: summarizeMediaSource(video),
        currentTime: Number(video.currentTime.toFixed(3)),
        duration: Number.isFinite(video.duration)
          ? Number(video.duration.toFixed(3))
          : String(video.duration),
        paused: video.paused,
        ended: video.ended,
        seeking: video.seeking,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error?.code ?? 0,
        buffered: summarizeTimeRanges(video.buffered),
        seekable: summarizeTimeRanges(video.seekable),
        detail: Object.freeze({ ...detail }),
        at: new Date().toISOString(),
      });
      playbackIncidents.push(incident);
      if (playbackIncidents.length > 20) {
        playbackIncidents.shift();
      }
      return incident;
    } catch (error) {
      reportFailure("Playback incident capture", error);
      return null;
    }
  }

  function createHookRegistry() {
    const entries = [];

    const descriptorMatches = (current, installed) =>
      Boolean(current) &&
      current.value === installed.value &&
      current.get === installed.get &&
      current.set === installed.set;

    const define = (target, key, descriptor, label) => {
      const previous = Object.getOwnPropertyDescriptor(target, key);
      if (previous && !previous.configurable) {
        throw new TypeError(`${label} is not configurable.`);
      }
      Object.defineProperty(target, key, descriptor);
      const entry = {
        descriptor,
        key,
        label,
        previous,
        released: false,
        target,
        type: "property",
      };
      entries.push(entry);
      return () => {
        if (entry.released) {
          return false;
        }
        const current = Object.getOwnPropertyDescriptor(target, key);
        if (!descriptorMatches(current, descriptor)) {
          return false;
        }
        if (previous) {
          Object.defineProperty(target, key, previous);
        } else {
          delete target[key];
        }
        entry.released = true;
        return true;
      };
    };

    const addCleanup = (label, cleanup) => {
      entries.push({ cleanup, label, type: "cleanup" });
    };

    const rollback = () => {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        try {
          if (entry.type === "cleanup") {
            entry.cleanup();
            continue;
          }
          if (entry.released) {
            continue;
          }
          const current = Object.getOwnPropertyDescriptor(
            entry.target,
            entry.key,
          );
          if (!descriptorMatches(current, entry.descriptor)) {
            stats.hookRollbackConflicts += 1;
            continue;
          }
          if (entry.previous) {
            Object.defineProperty(entry.target, entry.key, entry.previous);
          } else {
            delete entry.target[entry.key];
          }
        } catch (error) {
          stats.hookRollbackConflicts += 1;
          console.error(PREFIX, `${entry.label} rollback failed`, error);
        }
      }
      stats.hookRollbacks += 1;
    };

    const managedSupersession = (entry, current) => {
      let descriptor = entry.descriptor;
      let layered = false;
      const start = entries.indexOf(entry);
      for (let index = start + 1; index < entries.length; index += 1) {
        const candidate = entries[index];
        if (
          candidate.type !== "property" ||
          candidate.released ||
          candidate.target !== entry.target ||
          candidate.key !== entry.key ||
          !descriptorMatches(candidate.previous, descriptor)
        ) {
          continue;
        }
        descriptor = candidate.descriptor;
        layered = true;
      }
      return layered && descriptorMatches(current, descriptor);
    };

    const health = () =>
      Object.freeze(
        entries
          .filter((entry) => entry.type === "property")
          .map((entry) => {
            const current = Object.getOwnPropertyDescriptor(
              entry.target,
              entry.key,
            );
            return Object.freeze({
              label: entry.label,
              state: entry.released
                ? "released"
                : descriptorMatches(current, entry.descriptor)
                  ? "direct"
                  : managedSupersession(entry, current)
                    ? "managed"
                    : "superseded",
            });
          }),
      );

    return Object.freeze({ addCleanup, define, health, rollback });
  }

  const hookRegistry = createHookRegistry();
  const mediaEventHandlers = new Map();
  const MEDIA_INTENT_TRACKER_MARKER = Symbol.for(
    "chzzk-media-intent-tracker.v1",
  );
  const taskMediaIntentCandidates = new WeakMap();
  const pointerMediaIntentCandidates = new WeakMap();

  function addManagedEventListener(target, type, listener, options, label) {
    target.addEventListener(type, listener, options);
    hookRegistry.addCleanup(label ?? `${type} listener`, () =>
      target.removeEventListener(type, listener, options),
    );
  }

  function subscribeMediaEvents(eventNames, handler, label) {
    for (const eventName of eventNames) {
      let handlers = mediaEventHandlers.get(eventName);
      if (!handlers) {
        handlers = new Set();
        mediaEventHandlers.set(eventName, handlers);
      }
      handlers.add(handler);
    }
    hookRegistry.addCleanup(`${label} subscription`, () => {
      for (const eventName of eventNames) {
        mediaEventHandlers.get(eventName)?.delete(handler);
      }
    });
  }

  function installMediaEventHub() {
    if (!root.document) return;
    for (const [eventName, handlers] of mediaEventHandlers) {
      const dispatch = (event) => {
        for (const handler of handlers) {
          try {
            handler(event);
          } catch (error) {
            reportFailure(`Media event ${eventName}`, error);
          }
        }
      };
      addManagedEventListener(
        document,
        eventName,
        dispatch,
        true,
        `media:${eventName}`,
      );
    }
  }

  const currentPlaybackRoute = () => {
    const match = PLAYBACK_ROUTE.exec(root.location?.pathname ?? "");
    return match ? match[0].toLowerCase() : "";
  };

  const intentStateFor = (video) => {
    const route = currentPlaybackRoute();
    let state = userMediaIntents.get(video);
    if (!state || state.route !== route) {
      state = {
        pause: false,
        rate: Number.NaN,
        route,
        seekTarget: Number.NaN,
      };
      userMediaIntents.set(video, state);
    }
    return state;
  };

  const candidateAllows = (candidate, action) =>
    candidate?.route === currentPlaybackRoute() &&
    candidate.actions.has(action);

  const localHasActiveUserMediaIntent = (video, action) =>
    candidateAllows(taskMediaIntentCandidates.get(video), action) ||
    candidateAllows(pointerMediaIntentCandidates.get(video), action);

  const localHasUserMediaIntent = (video, action) => {
    const state = userMediaIntents.get(video);
    if (!state || state.route !== currentPlaybackRoute()) return false;
    if (action === "pause") return state.pause && video.paused;
    if (action === "rate") {
      return (
        Number.isFinite(state.rate) &&
        Math.abs(video.playbackRate - state.rate) <= 0.001
      );
    }
    if (action === "seek") {
      return (
        Number.isFinite(state.seekTarget) &&
        Math.abs(video.currentTime - state.seekTarget) <= 0.5
      );
    }
    return false;
  };

  const hasActiveUserMediaIntent = (video, action) => {
    const tracker = root[MEDIA_INTENT_TRACKER_MARKER];
    return tracker?.version === 1
      ? tracker.hasActive(video, action)
      : localHasActiveUserMediaIntent(video, action);
  };

  const hasUserMediaIntent = (video, action) => {
    const tracker = root[MEDIA_INTENT_TRACKER_MARKER];
    return tracker?.version === 1
      ? tracker.has(video, action)
      : localHasUserMediaIntent(video, action);
  };

  function installMediaIntentTracker() {
    if (!root.document || !root.Element || !root.HTMLMediaElement) return;
    const existing = root[MEDIA_INTENT_TRACKER_MARKER];
    if (
      existing?.version === 1 &&
      typeof existing.has === "function" &&
      typeof existing.hasActive === "function"
    ) {
      return;
    }
    if (existing !== undefined) {
      throw new Error("Shared media intent tracker marker collision.");
    }
    const mediaIntentSelector = [
      "video",
      "input[type='range']",
      "[role='slider']",
      "[data-role*='progress' i]",
      "[data-role*='seek' i]",
      "[data-role*='play' i]",
      "[data-role*='pause' i]",
      ".pzp-playback-switch",
      ".pzp-brand-playback-button",
      ".pzp-progress-slider",
      "pzp-progress-bar",
      "pzp-progress-slider",
    ].join(",");
    const resolveVideo = (target) => {
      const scope = target?.closest?.(PLAYER_SCOPE_SELECTOR);
      const directVideo = target?.closest?.("video");
      const preferred =
        scope?.querySelector("video[data-role='videoEl']") ??
        scope?.querySelector("video:not(.chzzk-p2p-bypass-auxiliary)");
      const video =
        directVideo ?? (preferred && findPrimaryPlaybackVideo(preferred));
      if (
        !video ||
        isAuxiliaryVideo(video) ||
        (scope && !scope.contains(video))
      ) {
        return null;
      }
      return video;
    };
    const allActions = Object.freeze(["pause", "play", "rate", "seek"]);
    const setTaskCandidate = (video, actions) => {
      const candidate = {
        actions: new Set(actions),
        route: currentPlaybackRoute(),
      };
      taskMediaIntentCandidates.set(video, candidate);
      stats.mediaIntentCandidates += 1;
      root.setTimeout(() => {
        if (taskMediaIntentCandidates.get(video) === candidate) {
          taskMediaIntentCandidates.delete(video);
        }
      }, 0);
    };
    const recordTargetCandidate = (target, actions = allActions) => {
      if (
        !(target instanceof Element) ||
        !target.closest(mediaIntentSelector)
      ) {
        return null;
      }
      const video = resolveVideo(target);
      if (video) setTaskCandidate(video, actions);
      return video;
    };
    addManagedEventListener(
      document,
      "pointerdown",
      (event) => {
        const video = recordTargetCandidate(event.target);
        if (!video) return;
        pointerMediaIntentCandidates.set(video, {
          actions: new Set(allActions),
          pointerId: event.pointerId,
          route: currentPlaybackRoute(),
        });
      },
      { capture: true, passive: true },
      "media intent pointerdown",
    );
    const endPointerIntent = (event) => {
      for (const video of document.querySelectorAll("video")) {
        const candidate = pointerMediaIntentCandidates.get(video);
        if (candidate?.pointerId === event.pointerId) {
          pointerMediaIntentCandidates.delete(video);
        }
      }
    };
    for (const type of ["pointerup", "pointercancel"]) {
      addManagedEventListener(
        document,
        type,
        endPointerIntent,
        { capture: true, passive: true },
        `media intent ${type}`,
      );
    }
    for (const type of ["click", "input", "change"]) {
      addManagedEventListener(
        document,
        type,
        (event) => recordTargetCandidate(event.target),
        { capture: true, passive: true },
        `media intent ${type}`,
      );
    }
    // Current CHZZK app owns global play/pause; the official player SDK owns
    // scoped seek/chapter/rate commands. A real media API call still confirms
    // the candidate below, so a matching key alone never becomes intent.
    const keyboardMediaActions = (event) => {
      if (!event.isTrusted || !document.hasFocus()) return null;
      const noModifier =
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      const applePlatform = /^(Mac|iPhone|iPad|iPod)/.test(
        root.navigator?.platform ?? "",
      );
      const chapterModifier = applePlatform
        ? event.altKey && !event.ctrlKey
        : event.ctrlKey && !event.altKey;
      if (noModifier && ["k", "K", "ㅏ", " "].includes(event.key)) {
        return ["pause", "play"];
      }
      if (
        ["ArrowLeft", "ArrowRight"].includes(event.key) &&
        !event.shiftKey &&
        !event.metaKey &&
        (noModifier || chapterModifier)
      ) {
        return ["seek"];
      }
      if (noModifier && ["Home", "End"].includes(event.key)) return ["seek"];
      if (
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        ["<", ">"].includes(event.key)
      ) {
        return ["rate"];
      }
      return null;
    };
    addManagedEventListener(
      document,
      "keydown",
      (event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          target.closest(
            "input,textarea,select,pre,[contenteditable='true'],[contenteditable='']",
          )
        ) {
          return;
        }
        const actions = keyboardMediaActions(event);
        if (!actions) return;
        if (target.closest(PLAYER_SCOPE_SELECTOR)) {
          const video = resolveVideo(target);
          if (video) setTaskCandidate(video, actions);
          return;
        }
        if (!actions.includes("play") || !currentPlaybackRoute()) return;
        const candidates = document.querySelectorAll(
          "video[data-role='videoEl'],video.webplayer-internal-video",
        );
        if (candidates.length > 16) return;
        let owner = null;
        for (const video of candidates) {
          if (!video.closest(PLAYER_SCOPE_SELECTOR) || isAuxiliaryVideo(video))
            continue;
          if (owner) return;
          owner = video;
        }
        if (owner) setTaskCandidate(owner, actions);
      },
      { capture: true, passive: true },
      "media intent keyboard",
    );

    const pauseMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "pause",
    );
    const playMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "play",
    );
    const currentTimeMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "currentTime",
    );
    const playbackRateMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "playbackRate",
    );
    if (
      !pauseMethod ||
      typeof pauseMethod.descriptor.value !== "function" ||
      !playMethod ||
      typeof playMethod.descriptor.value !== "function" ||
      !currentTimeMethod ||
      typeof currentTimeMethod.descriptor.set !== "function" ||
      !playbackRateMethod ||
      typeof playbackRateMethod.descriptor.get !== "function" ||
      typeof playbackRateMethod.descriptor.set !== "function"
    ) {
      throw new Error("Failed to obtain native media intent methods.");
    }
    const nativePause = pauseMethod.descriptor.value;
    const nativePlay = playMethod.descriptor.value;
    const nativeCurrentTimeSetter = currentTimeMethod.descriptor.set;
    const nativePlaybackRateGetter = playbackRateMethod.descriptor.get;
    const nativePlaybackRateSetter = playbackRateMethod.descriptor.set;
    hookRegistry.define(
      pauseMethod.owner,
      "pause",
      {
        ...pauseMethod.descriptor,
        value: function (...args) {
          const userAction =
            this instanceof HTMLVideoElement &&
            !this.paused &&
            hasActiveUserMediaIntent(this, "pause");
          const state = userAction ? intentStateFor(this) : null;
          const previous = state?.pause;
          if (state) state.pause = true;
          try {
            const result = Reflect.apply(nativePause, this, args);
            if (state) stats.mediaIntentPauseConfirmations += 1;
            return result;
          } catch (error) {
            if (state) state.pause = previous;
            throw error;
          }
        },
      },
      "HTMLMediaElement.prototype.pause user intent",
    );
    hookRegistry.define(
      playMethod.owner,
      "play",
      {
        ...playMethod.descriptor,
        value: function (...args) {
          const userAction =
            this instanceof HTMLVideoElement &&
            hasActiveUserMediaIntent(this, "play");
          const result = Reflect.apply(nativePlay, this, args);
          if (userAction) intentStateFor(this).pause = false;
          return result;
        },
      },
      "HTMLMediaElement.prototype.play user intent",
    );
    hookRegistry.define(
      currentTimeMethod.owner,
      "currentTime",
      {
        ...currentTimeMethod.descriptor,
        set(value) {
          const userAction =
            this instanceof HTMLVideoElement &&
            hasActiveUserMediaIntent(this, "seek");
          Reflect.apply(nativeCurrentTimeSetter, this, [value]);
          if (userAction) {
            const target = Number(value);
            if (Number.isFinite(target)) {
              intentStateFor(this).seekTarget = target;
              stats.mediaIntentSeekConfirmations += 1;
            }
          }
        },
      },
      "HTMLMediaElement.prototype.currentTime user intent",
    );
    hookRegistry.define(
      playbackRateMethod.owner,
      "playbackRate",
      {
        ...playbackRateMethod.descriptor,
        set(value) {
          const userAction =
            this instanceof HTMLVideoElement &&
            hasActiveUserMediaIntent(this, "rate");
          Reflect.apply(nativePlaybackRateSetter, this, [value]);
          if (userAction) {
            const rate = Reflect.apply(nativePlaybackRateGetter, this, []);
            if (Number.isFinite(rate)) {
              intentStateFor(this).rate = rate;
              stats.mediaIntentRateConfirmations += 1;
            }
          }
        },
      },
      "HTMLMediaElement.prototype.playbackRate user intent",
    );
    hookRegistry.define(
      root,
      MEDIA_INTENT_TRACKER_MARKER,
      {
        configurable: true,
        value: Object.freeze({
          has: localHasUserMediaIntent,
          hasActive: localHasActiveUserMediaIntent,
          version: 1,
        }),
      },
      "shared media intent tracker",
    );
  }
  function trustedCdnUrl(candidate) {
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
      const trusted = TRUSTED_CDN_SUFFIXES.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      );

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !trusted
      ) {
        return null;
      }

      let bitrateLimitsRemoved = 0;
      if (/\.m3u8$/i.test(url.pathname)) {
        const restrictedKeys = [
          ...new Set(
            [...url.searchParams.keys()].filter(
              (key) => key.toLowerCase() === "max-bitrate",
            ),
          ),
        ];
        for (const key of restrictedKeys) {
          bitrateLimitsRemoved += url.searchParams.getAll(key).length;
          url.searchParams.delete(key);
        }
      }

      return Object.freeze({
        href: url.href,
        bitrateLimitsRemoved,
      });
    } catch {
      return null;
    }
  }

  function directUrlFromP2pPath(p2pPath) {
    if (typeof p2pPath !== "string" || !p2pPath || !nativeAtob) {
      return null;
    }

    try {
      const encoded = new URL(
        p2pPath,
        "https://chzzk.naver.com/",
      ).searchParams.get("cdn_url");
      if (!encoded) {
        return null;
      }

      const base64 = encoded
        .replace(/ /g, "+")
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      const binary = nativeAtob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return trustedCdnUrl(utf8Decoder.decode(bytes));
    } catch {
      return null;
    }
  }

  function prepareTrackPath(record) {
    if (!isRecord(record) || typeof record.path !== "string") {
      return false;
    }

    // Keep every signed/session parameter except the player-side bitrate cap.
    const normalized = trustedCdnUrl(record.path);
    if (!normalized) {
      return false;
    }

    preconnectOrigin(normalized.href);
    if (!normalized.bitrateLimitsRemoved) {
      return false;
    }

    record.path = normalized.href;
    stats.bitrateLimitsRemoved += normalized.bitrateLimitsRemoved;
    return true;
  }

  function removeP2pMetadata(record) {
    let changed = false;

    for (const key of Object.keys(record)) {
      const normalizedKey = key.toLowerCase();
      if (!P2P_METADATA_KEYS.has(normalizedKey)) {
        continue;
      }

      if (normalizedKey === "p2p" && typeof record[key] === "boolean") {
        if (record[key] !== false) {
          record[key] = false;
          changed = true;
        }
        continue;
      }

      delete record[key];
      changed = true;
    }

    return changed;
  }

  function rewriteTrack(track) {
    if (!isRecord(track)) {
      return { keep: true, changed: false };
    }

    let changed = false;
    if (typeof track.p2pPath === "string") {
      const direct = directUrlFromP2pPath(track.p2pPath);
      if (direct) {
        track.path = direct.href;
        stats.bitrateLimitsRemoved += direct.bitrateLimitsRemoved;
        preconnectOrigin(direct.href);
        stats.directTracks += 1;
        changed = true;
      } else {
        stats.rejectedCdnUrls += 1;
        reportIssue(
          "P2P CDN path validation",
          "A P2P path did not contain a valid trusted HTTPS CDN URL.",
          "invalid-p2p-cdn-url",
        );
        if (typeof track.path !== "string" || !track.path) {
          stats.droppedTracks += 1;
          reportIssue(
            "P2P-only track removal",
            "An unusable P2P-only track was removed instead of being passed to the player.",
            "p2p-only-track-removed",
          );
          return { keep: false, changed: true };
        }
      }
    }

    changed = prepareTrackPath(track) || changed;

    return {
      keep: true,
      changed: removeP2pMetadata(track) || changed,
    };
  }

  function rewriteMedia(media) {
    if (!isRecord(media)) {
      return false;
    }

    let changed = false;
    if (typeof media.p2pPath === "string") {
      const direct = directUrlFromP2pPath(media.p2pPath);
      if (direct) {
        media.path = direct.href;
        stats.bitrateLimitsRemoved += direct.bitrateLimitsRemoved;
        preconnectOrigin(direct.href);
        stats.directTracks += 1;
        changed = true;
      } else {
        stats.rejectedCdnUrls += 1;
        reportIssue(
          "P2P CDN path validation",
          "A P2P path did not contain a valid trusted HTTPS CDN URL.",
          "invalid-p2p-cdn-url",
        );
      }
    }
    changed = prepareTrackPath(media) || changed;
    changed = removeP2pMetadata(media) || changed;

    if (!Array.isArray(media.encodingTrack)) {
      return changed;
    }

    const tracks = [];
    for (const track of media.encodingTrack) {
      const result = rewriteTrack(track);
      changed = result.changed || changed;
      if (result.keep) {
        tracks.push(track);
      }
    }
    if (tracks.length !== media.encodingTrack.length) {
      media.encodingTrack = tracks;
      changed = true;
    }
    return changed;
  }

  function rewritePlayback(playback) {
    if (
      !isRecord(playback) ||
      (!Array.isArray(playback.media) && !isRecord(playback.live))
    ) {
      return false;
    }

    let changed = removeP2pMetadata(playback);
    if (isRecord(playback.meta)) {
      changed = removeP2pMetadata(playback.meta) || changed;
      if (playback.meta.p2p !== false) {
        playback.meta.p2p = false;
        changed = true;
      }
    }

    if (Array.isArray(playback.media)) {
      for (const media of playback.media) {
        changed = rewriteMedia(media) || changed;
      }
    }
    if (isRecord(playback.live)) {
      changed = rewriteMedia(playback.live) || changed;
    }

    if (Array.isArray(playback.api)) {
      const filtered = playback.api.filter((entry) => {
        if (!isRecord(entry)) {
          return true;
        }
        const name = String(entry.name ?? "").toLowerCase();
        const path = String(entry.path ?? "").toLowerCase();
        return !name.includes("p2p") && !path.includes("/p2p/");
      });
      if (filtered.length !== playback.api.length) {
        playback.api = filtered;
        changed = true;
      }
    }

    return changed;
  }

  function clearPlaybackRestriction(value) {
    if (!isObject(value)) {
      return false;
    }

    let changed = false;
    const stack = [value];
    const visited = new WeakSet();

    while (stack.length) {
      const current = stack.pop();
      if (!isObject(current) || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (!Array.isArray(current)) {
        for (const key of ["playableStatus", "status"]) {
          if (RESTRICTED_STATUSES.has(current[key])) {
            current[key] = "PLAYABLE";
            if (hasOwn(current, "trafficThrottling")) {
              current.trafficThrottling = -1;
            }
            stats.restrictions += 1;
            changed = true;
          } else if (
            typeof current[key] === "string" &&
            /LOW_RESOLUTION/i.test(current[key])
          ) {
            stats.unsupportedRestrictions += 1;
            reportIssue(
              "Unsupported playback restriction",
              current[key],
              `restriction:${current[key]}`,
            );
          }
        }
      }

      for (const child of Array.isArray(current)
        ? current
        : Object.values(current)) {
        if (isObject(child)) {
          stack.push(child);
        }
      }
    }

    return changed;
  }

  function rewriteJsonString(record, key, rewrite) {
    const source = record[key];
    if (typeof source !== "string" || !source.trimStart().startsWith("{")) {
      return false;
    }

    let value;
    try {
      value = Reflect.apply(nativeJsonParse, JSON, [source]);
    } catch (error) {
      reportFailure(`Playback field ${key} parsing`, error);
      return false;
    }
    if (!rewrite(value)) {
      return false;
    }
    record[key] = Reflect.apply(nativeJsonStringify, JSON, [value]);
    return true;
  }

  function rewriteIntegrityProbe(value) {
    if (
      !isRecord(value) ||
      Array.isArray(value.media) ||
      (!hasOwn(value, "liveId") && !hasOwn(value, "chatChannelId"))
    ) {
      return false;
    }

    let changed = false;
    for (const key of ["liveId", "chatChannelId"]) {
      if (hasOwn(value, key) && typeof value[key] === "boolean" && value[key]) {
        value[key] = false;
        changed = true;
      }
    }
    if (changed) {
      stats.integritySignals += 1;
    }
    return changed;
  }

  function rewritePlaybackValue(value) {
    const playbackChanged = rewritePlayback(value);
    return rewriteIntegrityProbe(value) || playbackChanged;
  }

  function rewriteLiveContent(content) {
    if (!isRecord(content)) {
      return false;
    }

    const playbackFields = Object.keys(content).filter(
      (key) => PLAYBACK_FIELD_SET.has(key) || PLAYBACK_FIELD_PATTERN.test(key),
    );
    const isLivePayload =
      playbackFields.length > 0 ||
      hasOwn(content, "p2pQuality") ||
      hasOwn(content, "dab") ||
      hasOwn(content, "livePollingStatusJson");
    if (!isLivePayload) {
      return false;
    }

    let changed = false;

    if (hasOwn(content, "dab") && content.dab !== false) {
      content.dab = false;
      stats.adBlockFlags += 1;
      changed = true;
    }
    if (Array.isArray(content.p2pQuality) && content.p2pQuality.length) {
      content.p2pQuality = [];
      changed = true;
    }

    for (const key of playbackFields) {
      let fieldChanged;
      if (isRecord(content[key])) {
        fieldChanged = rewritePlaybackValue(content[key]);
      } else {
        fieldChanged = rewriteJsonString(content, key, rewritePlaybackValue);
      }
      if (fieldChanged && !PLAYBACK_FIELD_SET.has(key)) {
        stats.discoveredPlaybackFields += 1;
        reportIssue("Discovered playback field", key, `playback-field:${key}`);
      }
      changed = fieldChanged || changed;
    }

    if (isRecord(content.livePollingStatus)) {
      changed = clearPlaybackRestriction(content.livePollingStatus) || changed;
    }
    if (isRecord(content.livePollingStatusData)) {
      changed =
        clearPlaybackRestriction(content.livePollingStatusData) || changed;
    }
    if (hasOwn(content, "livePollingStatusJson")) {
      changed =
        rewriteJsonString(
          content,
          "livePollingStatusJson",
          clearPlaybackRestriction,
        ) || changed;
    }

    return changed;
  }

  function rewritePayload(payload) {
    if (!isObject(payload)) {
      return false;
    }

    let changed = false;
    if (isRecord(payload)) {
      changed = rewritePlayback(payload) || changed;
      changed = rewriteLiveContent(payload) || changed;

      if (isRecord(payload.content)) {
        changed = rewriteLiveContent(payload.content) || changed;
      }
    }
    return changed;
  }

  function hasLiveContent(value) {
    return (
      isObject(value) &&
      (PLAYBACK_FIELDS.some((key) => key in value) ||
        Object.keys(value).some(
          (key) =>
            !PLAYBACK_FIELD_SET.has(key) && PLAYBACK_FIELD_PATTERN.test(key),
        ) ||
        "p2pQuality" in value ||
        "dab" in value ||
        "livePollingStatusJson" in value ||
        "livePollingStatus" in value ||
        "livePollingStatusData" in value)
    );
  }
  function installJsonHook() {
    const descriptor = Object.getOwnPropertyDescriptor(JSON, "parse");
    function parse(text, reviver) {
      const result = Reflect.apply(nativeJsonParse, this, arguments);
      if (result === null || typeof result !== "object") {
        return result;
      }
      if ("content" in result) {
        if (!hasLiveContent(result.content)) {
          return result;
        }
      } else if (!("media" in result) && !("live" in result)) {
        return result;
      }
      try {
        const startedAt = monotonicNow();
        if (rewritePayload(result)) {
          recordTime("jsonTransformTimeMs", null, startedAt);
          stats.jsonResponses += 1;
        }
      } catch (error) {
        throw reportFailure("JSON response transformation", error);
      }
      return result;
    }

    const installedDescriptor = {
      ...descriptor,
      value: parse,
    };
    const releaseHook = hookRegistry.define(
      JSON,
      "parse",
      installedDescriptor,
      "JSON.parse",
    );

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      if (releaseHook()) {
        stats.jsonHookReleases += 1;
      }
    };
  }

  function installResponseHook() {
    const prototype = root.Response?.prototype;
    const descriptor = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "json")
      : null;
    if (!descriptor || typeof descriptor.value !== "function") {
      return;
    }

    const nativeResponseJson = descriptor.value;
    function json(...args) {
      const promise = Reflect.apply(nativeResponseJson, this, args);
      const url = this?.url;
      if (
        typeof url === "string" &&
        url &&
        !url.startsWith("https://api.chzzk.naver.com/")
      ) {
        return promise;
      }
      return promise.then((result) => {
        try {
          const startedAt = monotonicNow();
          if (rewritePayload(result)) {
            recordTime("responseTransformTimeMs", null, startedAt);
            stats.jsonResponses += 1;
            lifecycleCallbacks.releaseJsonFallback();
          }
        } catch (error) {
          throw reportFailure("Response JSON transformation", error);
        }
        return result;
      });
    }
    hookRegistry.define(
      prototype,
      "json",
      { ...descriptor, value: json },
      "Response.prototype.json",
    );
  }

  function bytesOf(bufferSource) {
    if (bufferSource instanceof ArrayBuffer) {
      return new Uint8Array(bufferSource);
    }
    if (ArrayBuffer.isView(bufferSource)) {
      return new Uint8Array(
        bufferSource.buffer,
        bufferSource.byteOffset,
        bufferSource.byteLength,
      );
    }
    return null;
  }

  function bytesMatch(source, expected, offset = 0) {
    if (!source || source.byteLength < offset + expected.byteLength) {
      return false;
    }
    for (let index = 0; index < expected.byteLength; index += 1) {
      if (source[offset + index] !== expected[index]) {
        return false;
      }
    }
    return true;
  }

  function inspectTunnelFamily(algorithm) {
    if (!isRecord(algorithm)) {
      return null;
    }
    const aad = bytesOf(algorithm.additionalData);
    if (!aad || aad.byteLength < 2) {
      return null;
    }
    const labelLength = (aad[0] << 8) | aad[1];
    if (
      labelLength < TUNNEL_LABEL_PREFIX.byteLength ||
      aad.byteLength < 2 + labelLength ||
      !bytesMatch(aad, TUNNEL_LABEL_PREFIX, 2)
    ) {
      return null;
    }
    const labelBytes = aad.subarray(2, 2 + labelLength);
    let label;
    try {
      label = utf8Decoder.decode(labelBytes);
    } catch {
      label = "invalid-utf8";
    }
    return {
      aad,
      algorithm: String(algorithm.name ?? "").toUpperCase(),
      iv: bytesOf(algorithm.iv),
      label,
      labelBytes,
      tagLength: algorithm.tagLength,
    };
  }

  function matchTunnelProtocol(algorithm) {
    const inspected = inspectTunnelFamily(algorithm);
    if (!inspected) {
      return null;
    }
    const profile = TUNNEL_PROTOCOLS.find(
      (candidate) =>
        inspected.algorithm === candidate.algorithm &&
        inspected.iv?.byteLength === candidate.ivLength &&
        inspected.aad.byteLength === candidate.aadLength &&
        inspected.labelBytes.byteLength === candidate.labelBytes.byteLength &&
        bytesMatch(inspected.labelBytes, candidate.labelBytes) &&
        (inspected.tagLength === undefined ||
          inspected.tagLength === candidate.tagLength),
    );
    if (!profile) {
      stats.unsupportedTunnelProtocols += 1;
      reportIssue(
        "Unsupported tunnel protocol",
        new Error(
          `${inspected.label}; algorithm=${inspected.algorithm || "unknown"}; ` +
            `iv=${inspected.iv?.byteLength ?? 0}; aad=${inspected.aad.byteLength}; ` +
            `tag=${inspected.tagLength ?? "default"}`,
        ),
        `tunnel:${inspected.label}:${inspected.algorithm}:${inspected.aad.byteLength}:${inspected.tagLength}`,
      );
    }
    return profile ?? null;
  }

  function rewriteTunnelPlaintext(buffer) {
    const startedAt = monotonicNow();
    const bytes = bytesOf(buffer);
    if (
      !bytes ||
      !bytes.byteLength ||
      bytes.byteLength > MAX_TUNNEL_JSON_BYTES
    ) {
      const error = new RangeError(
        `service/t plaintext size is out of range: ${bytes?.byteLength ?? 0}`,
      );
      stats.tunnelFailures += 1;
      stats.tunnelPassThroughs += 1;
      reportFailure("service/t plaintext validation", error);
      return buffer;
    }

    try {
      const text = utf8Decoder.decode(bytes);
      const jsonText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      if (!/^[\[{]/.test(jsonText.trimStart())) {
        const error = new TypeError("service/t plaintext is not JSON.");
        throw error;
      }

      const payload = Reflect.apply(nativeJsonParse, JSON, [jsonText]);
      if (!rewritePayload(payload)) {
        recordTime(
          "tunnelTransformTimeMs",
          "maxTunnelTransformTimeMs",
          startedAt,
        );
        return buffer;
      }

      stats.tunnelResponses += 1;
      lifecycleCallbacks.releaseJsonFallback();
      const rewritten = utf8Encoder.encode(
        Reflect.apply(nativeJsonStringify, JSON, [payload]),
      ).buffer;
      recordTime(
        "tunnelTransformTimeMs",
        "maxTunnelTransformTimeMs",
        startedAt,
      );
      return rewritten;
    } catch (error) {
      stats.tunnelFailures += 1;
      stats.tunnelPassThroughs += 1;
      reportFailure("service/t response transformation", error);
      return buffer;
    }
  }

  function findMethodDescriptor(object, key) {
    let current = object;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor) {
        return { owner: current, descriptor };
      }
      current = Object.getPrototypeOf(current);
    }
    return null;
  }

  function installTunnelHooks() {
    const subtle = root.crypto?.subtle;
    const decryptMethod = subtle
      ? findMethodDescriptor(subtle, "decrypt")
      : null;
    if (
      !decryptMethod ||
      typeof decryptMethod.descriptor.value !== "function"
    ) {
      throw new Error("Failed to install the WebCrypto decrypt hook.");
    }

    const nativeDecrypt = decryptMethod.descriptor.value;
    function decrypt(algorithm, key, data) {
      const targeted = Boolean(matchTunnelProtocol(algorithm));
      if (targeted) {
        stats.tunnelDecrypts += 1;
      }
      let promise;
      try {
        promise = Reflect.apply(nativeDecrypt, this, arguments);
      } catch (error) {
        if (targeted) {
          stats.tunnelFailures += 1;
          throw reportFailure("service/t decryption", error);
        }
        throw error;
      }
      if (!targeted) {
        return promise;
      }
      return Promise.resolve(promise).then(rewriteTunnelPlaintext, (error) => {
        stats.tunnelFailures += 1;
        throw reportFailure("service/t decryption", error);
      });
    }
    hookRegistry.define(
      decryptMethod.owner,
      "decrypt",
      { ...decryptMethod.descriptor, value: decrypt },
      "SubtleCrypto.prototype.decrypt",
    );
  }

  function definePrototypeSignal(name, setter) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, name)) {
      return false;
    }
    hookRegistry.define(
      Object.prototype,
      name,
      {
        configurable: true,
        get() {
          return undefined;
        },
        set: setter,
      },
      `Object.prototype.${name}`,
    );
    return true;
  }

  function setOwnValue(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  function installPlaybackSignalGuards() {
    const rejectionInstalled = definePrototypeSignal(
      PLAYBACK_REJECTION_EVENT,
      function (value) {
        // Preserve enum creation, but reject listener/state assignments which
        // would clear the primary player's src after an ad delivery failure.
        if (value === PLAYBACK_REJECTION_EVENT) {
          setOwnValue(this, PLAYBACK_REJECTION_EVENT, value);
        } else {
          stats.blockedAdFailures += 1;
        }
      },
    );

    const advanceInstalled = definePrototypeSignal(
      PLAYBACK_ADVANCE_EVENT,
      function (value) {
        if (Array.isArray(value)) {
          playbackAdvanceListeners = value;
          playbackAdvanceGeneration += 1;
          const generation = playbackAdvanceGeneration;
          const scope = capturePlaybackTaskScope(document.documentElement);
          enqueueMicrotask(() => {
            if (
              !isPlaybackTaskCurrent(scope) ||
              generation !== playbackAdvanceGeneration ||
              playbackAdvanceListeners !== value
            )
              return;
            lifecycleCallbacks.reconcileAuxiliaryVideos(
              "listener-registration",
            );
          });
        }
        setOwnValue(this, PLAYBACK_ADVANCE_EVENT, value);
      },
    );
    if (!rejectionInstalled || !advanceInstalled) {
      throw new Error("The ad playback signal hook names are already in use.");
    }
  }
  // CHZZK's blocker probe checks a fixed list of bait class names through
  // getComputedStyle. Exact matching avoids changing normal page elements.
  const AD_BAIT_CLASSES = new Set([
    "banner_ad_wrapper",
    "TopAdBox",
    "ad--dart",
    "ad-container-side",
    "ad-tag__wrapper",
    "ad_regular1",
    "ad_slot_inread",
    "adguru-modal-popup",
    "ads_box_headline",
    "adsmedrect",
    "advert-loader",
    "advertisementContainer",
    "advertising-top-box",
    "artnet-ads-ad",
    "dianomi_context",
    "divAdright",
    "footer__ads--content",
    "header-article-ads",
    "header-bannerad",
    "incontentAd",
    "js-anchor-ad",
    "module-box-ads",
    "moduletable_advertisement",
    "news-ad-square-a",
    "nfy-ad-wrapper",
    "rekl_left",
    "sidebar-advert",
    "slideshow-ad-wrapper",
    "widget--local-ads",
    "zaf-adhesion-container",
    "zerg-widget",
  ]);
  const adBaitCache = new WeakMap();

  function isAdBaitElement(element) {
    const classList = element?.classList;
    if (!classList) {
      return false;
    }
    const className = element.getAttribute?.("class") ?? "";
    const cached = adBaitCache.get(element);
    if (cached?.className === className) {
      return cached.matches;
    }
    let matches = false;
    for (const className of classList) {
      if (AD_BAIT_CLASSES.has(className)) {
        matches = true;
        break;
      }
    }
    adBaitCache.set(element, { className, matches });
    return matches;
  }

  function visibleStyle(style) {
    return new Proxy(style, {
      get(target, key) {
        if (key === "display") return "block";
        if (key === "visibility") return "visible";
        if (key === "opacity") return "1";
        if (key === "getPropertyValue") {
          return (property) => {
            if (property === "display") return "block";
            if (property === "visibility") return "visible";
            if (property === "opacity") return "1";
            return target.getPropertyValue(property);
          };
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  function installAdBaitHook() {
    const method = findMethodDescriptor(root, "getComputedStyle");
    if (!method || typeof method.descriptor.value !== "function") {
      return;
    }
    const nativeGetComputedStyle = method.descriptor.value;
    function getComputedStyle(element, pseudoElement) {
      const style = Reflect.apply(nativeGetComputedStyle, this, arguments);
      return isAdBaitElement(element) ? visibleStyle(style) : style;
    }
    hookRegistry.define(
      method.owner,
      "getComputedStyle",
      { ...method.descriptor, value: getComputedStyle },
      "Window.getComputedStyle",
    );
  }

  const AUXILIARY_VIDEO_SELECTORS = Object.freeze([
    "[data-role='adVideoContainerEl']",
    "[data-role='imaAdContainerEl']",
    "[data-role='gvAdContainerEl']",
    "#midAdVideoContainer",
    "#midAdPlayerWrapper",
  ]);
  const AUXILIARY_UI_SELECTORS = Object.freeze([
    "[data-role='adPlayerInterface']",
    "[data-role='adControlEl']",
    "[data-role='adBtnControlEl']",
    "[data-role='countDownEl']",
    "[data-role='countDownTxt']",
    "[data-role='skipBtn']",
    "[data-role='skipInfo']",
    "[data-role='adLink']",
    "[data-role='providerArea']",
    "[data-role='smrPostrollNoticeArea']",
    "[data-role='smrPostrollNoticeAreaTxt']",
    "[data-role='smrRemindBannerArea']",
    "[data-role='smrRemindBannerBtnClose']",
    "[data-role='smrRemindBannerLink']",
    "[data-role='smrRemindTextArea']",
    "[data-role='smrRemindTextBtnClose']",
    "[data-role='smrRemindTextBtnUnfold']",
    "[data-role='smrRemindTextItem']",
    "[data-role='smrRemindTextLink']",
    "pzp-ad-break-indicator",
    ".pzp-ad-break-indicator",
    "pzp-midroll-dimmed",
    ".pzp-midroll-dimmed",
    "pzp-ad-click-through-button",
    ".webplayer-internal-core-ad-ui",
    ".advertisement_guide",
  ]);
  const AUXILIARY_VIDEO_SELECTOR = AUXILIARY_VIDEO_SELECTORS.join(",");
  const AUXILIARY_UI_SELECTOR = AUXILIARY_UI_SELECTORS.join(",");
  const AUXILIARY_VIDEO_CLASS = "chzzk-p2p-bypass-auxiliary";
  // VOD adBreakCountdown is represented by this component/class pair. Its
  // native animationend handler clears the state and calls startAd().
  const MIDROLL_COUNTDOWN_CLASS = "pzp-midroll-dimmed";
  const MIDROLL_COUNTDOWN_SELECTOR = ".pzp-midroll-dimmed";
  const MIDROLL_COUNTDOWN_STARTED_CLASS = "pzp-midroll-dimmed--started";
  const AD_MEDIA_HOST =
    /(^|\.)((tvetamovie\.pstatic\.net)|(glad-vod\.pstatic\.net)|(video-gfa\.pstatic\.net))$/i;
  const auxiliaryVideoCache = new WeakMap();
  let auxiliaryDomRevision = 0;
  // Display slots registered by the current CHZZK app with gladsdk. These are
  // separate from the player's video-ad lifecycle and may be removed from flow.
  const DISPLAY_AD_SLOT_SELECTOR = [
    "#home_banner",
    "#live_end_banner",
    "#vod_end_banner",
    "#live_rs_banner",
    "#vod_rs_banner",
  ].join(",");
  const DISPLAY_AD_MARKER = "data-chzzk-display-ad-slot";
  const VERIFIED_DISPLAY_AD_SELECTOR = DISPLAY_AD_SLOT_SELECTOR.split(",")
    .map(
      (selector) => `${selector}[${DISPLAY_AD_MARKER}="${selector.slice(1)}"]`,
    )
    .join(",");
  const HOME_TOP_SKIN_SELECTOR = '[data-nlog-area="home_top_skin"]';
  const HOME_TOP_SKIN_MARKER = "data-chzzk-home-top-skin-ad";
  const HOME_TOP_SKIN_ROOT_MARKER = "data-chzzk-home-top-skin-ad-hidden";
  const HOME_TOP_SKIN_HEADER_OFFSET = "--chzzk-home-skin-header-offset";
  const HOME_TOP_SKIN_CONTENT_OFFSET = "--chzzk-home-skin-content-offset";
  const HOME_TOP_SKIN_SIDEBAR_OFFSET = "--chzzk-home-skin-sidebar-offset";
  const UNMUTED_INDICATOR_MARKER = "data-chzzk-unmuted-indicator";
  const hiddenHomeTopSkins = new WeakSet();

  const reactDataValue = (object, key) =>
    object && Object.getOwnPropertyDescriptor(object, key)?.value;

  function committedReactFiber(element, app) {
    const committed = (fiber) => {
      let top = fiber;
      for (let depth = 0; top && depth < 64; depth += 1) {
        const parent = reactDataValue(top, "return");
        if (!parent) {
          const state = reactDataValue(top, "stateNode");
          return reactDataValue(top, "tag") === 3 &&
            reactDataValue(state, "current") === top &&
            reactDataValue(state, "containerInfo") === app
            ? fiber
            : null;
        }
        top = parent;
      }
      return null;
    };
    const key = Object.keys(element).find((name) =>
      name.startsWith("__reactFiber$"),
    );
    const candidate = key && reactDataValue(element, key);
    return (
      committed(candidate) || committed(reactDataValue(candidate, "alternate"))
    );
  }

  // A reused ID is not evidence of advertising. Require the current official
  // React tree's ad component/configuration, without changing React or the SDK.
  function isOwnedDisplayAdSlot(element) {
    const app = document.getElementById("root");
    if (
      !app ||
      !app.contains(element) ||
      !element.matches(DISPLAY_AD_SLOT_SELECTOR)
    )
      return false;
    try {
      let fiber = committedReactFiber(element, app);
      if (!fiber || reactDataValue(fiber, "stateNode") !== element)
        return false;
      for (
        let depth = 0;
        fiber && depth < 12;
        depth++, fiber = reactDataValue(fiber, "return")
      ) {
        const info = reactDataValue(
          reactDataValue(fiber, "memoizedProps"),
          "adSlotInfo",
        );
        const custom = reactDataValue(info, "customParam");
        const expectedService =
          element.id === "home_banner"
            ? "chzzk_main"
            : element.id.startsWith("live_")
              ? "chzzk_live"
              : "chzzk_video";
        if (
          [11, 14].includes(reactDataValue(fiber, "tag")) &&
          reactDataValue(info, "adSlotElementId") === element.id &&
          typeof reactDataValue(info, "adUnitId") === "string" &&
          reactDataValue(info, "adUnitId").length > 0 &&
          reactDataValue(custom, "cp") === "chzzk" &&
          reactDataValue(custom, "pcmo") === "pc" &&
          reactDataValue(custom, "svc") === expectedService
        )
          return true;
      }
    } catch {
      // Unknown/future application or third-party shape remains visible.
    }
    return false;
  }

  function reconcileDisplayAdSlot(element) {
    if (!(element instanceof Element)) return;
    const owned = isOwnedDisplayAdSlot(element);
    if (owned && element.getAttribute(DISPLAY_AD_MARKER) !== element.id)
      element.setAttribute(DISPLAY_AD_MARKER, element.id);
    else if (!owned && element.hasAttribute(DISPLAY_AD_MARKER))
      element.removeAttribute(DISPLAY_AD_MARKER);
  }

  function visitDisplayAdSlots(node) {
    if (!(node instanceof Element)) return;
    const selector = `${DISPLAY_AD_SLOT_SELECTOR},[${DISPLAY_AD_MARKER}]`;
    if (node.matches(selector)) reconcileDisplayAdSlot(node);
    for (const slot of node.querySelectorAll(selector))
      reconcileDisplayAdSlot(slot);
  }

  function validHomeTopSkinUrl(value) {
    if (typeof value !== "string" || value.length === 0) return false;
    try {
      return new URL(value, location.href).protocol === "https:";
    } catch {
      return false;
    }
  }

  // The home skin is separate from gladsdk display slots. The current app
  // explicitly supplies adId/adImageUrl/adLandingUrl to its expanded skin
  // component and accounts it as home_top_skin_ad. Require that committed
  // React contract so a third-party element reusing the telemetry attribute is
  // not hidden.
  function ownedHomeTopSkinAd(element) {
    const app = document.getElementById("root");
    if (
      !app ||
      !app.contains(element) ||
      !element.matches(HOME_TOP_SKIN_SELECTOR)
    )
      return null;
    try {
      const paramsText = element.getAttribute("data-nlog-params");
      const params = paramsText && nativeJsonParse(paramsText);
      const skinId = String(params?.skin_id ?? "");
      if (!skinId) return null;
      const host = committedReactFiber(element, app);
      const hostProps = reactDataValue(host, "memoizedProps");
      if (
        !host ||
        reactDataValue(host, "stateNode") !== element ||
        reactDataValue(hostProps, "data-nlog-area") !== "home_top_skin" ||
        reactDataValue(hostProps, "data-nlog-params") !== paramsText
      )
        return null;
      const queue = [reactDataValue(host, "child")];
      const seen = new Set();
      for (let visited = 0; queue.length > 0 && visited < 128; visited += 1) {
        const fiber = queue.shift();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);
        const props = reactDataValue(fiber, "memoizedProps");
        const componentSkinId = reactDataValue(props, "skinId");
        const adId = reactDataValue(props, "adId");
        if (
          reactDataValue(fiber, "tag") === 15 &&
          String(componentSkinId ?? "") === skinId &&
          Number.isInteger(adId) &&
          adId > 0 &&
          validHomeTopSkinUrl(reactDataValue(props, "backgroundImageUrl")) &&
          validHomeTopSkinUrl(reactDataValue(props, "eventImageUrl")) &&
          validHomeTopSkinUrl(reactDataValue(props, "eventLandingUrl")) &&
          validHomeTopSkinUrl(reactDataValue(props, "adImageUrl")) &&
          validHomeTopSkinUrl(reactDataValue(props, "adLandingUrl"))
        )
          return skinId;
        queue.push(
          reactDataValue(fiber, "child"),
          reactDataValue(fiber, "sibling"),
        );
      }
    } catch {
      // Unknown/future application or third-party shape remains visible.
    }
    return null;
  }

  function inlineTranslateY(element) {
    const match = element?.style.transform?.match(
      /^translateY\((-?\d+(?:\.\d+)?)px\)$/,
    );
    return match ? Number(match[1]) : null;
  }

  function inlinePixels(element, property) {
    const value = element?.style?.[property];
    const match = value?.match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : null;
  }

  function setHomeTopSkinOffset(name, nativeOffset, skinOffset, fallback) {
    const adjusted =
      Number.isFinite(nativeOffset) && Number.isFinite(skinOffset)
        ? Math.max(0, nativeOffset - skinOffset)
        : fallback;
    document.documentElement.style.setProperty(name, `${adjusted}px`);
  }

  function clearHomeTopSkinLayout() {
    const html = document.documentElement;
    if (!html) return;
    html.removeAttribute(HOME_TOP_SKIN_ROOT_MARKER);
    for (const name of [
      HOME_TOP_SKIN_HEADER_OFFSET,
      HOME_TOP_SKIN_CONTENT_OFFSET,
      HOME_TOP_SKIN_SIDEBAR_OFFSET,
    ])
      html.style.removeProperty(name);
  }

  function reconcileHomeTopSkinAd() {
    const html = document.documentElement;
    if (!html) return null;
    let selected = null;
    for (const element of document.querySelectorAll(
      `${HOME_TOP_SKIN_SELECTOR},[${HOME_TOP_SKIN_MARKER}]`,
    )) {
      const skinId = ownedHomeTopSkinAd(element);
      if (skinId) {
        element.setAttribute(HOME_TOP_SKIN_MARKER, skinId);
        selected ??= element;
        if (!hiddenHomeTopSkins.has(element)) {
          hiddenHomeTopSkins.add(element);
          stats.homeTopSkinAdsHidden += 1;
        }
      } else {
        element.removeAttribute(HOME_TOP_SKIN_MARKER);
      }
    }
    if (!selected) {
      clearHomeTopSkinLayout();
      return null;
    }
    // Visibility and clipping keep the native 110/51px geometry measurable.
    // Subtract only that skin contribution from the app's inline offsets so a
    // simultaneous emergency banner remains in place.
    const skinOffset = selected.getBoundingClientRect().height;
    if (!(skinOffset > 0 && skinOffset <= 300)) {
      clearHomeTopSkinLayout();
      return selected;
    }
    html.setAttribute(
      HOME_TOP_SKIN_ROOT_MARKER,
      selected.getAttribute(HOME_TOP_SKIN_MARKER),
    );
    setHomeTopSkinOffset(
      HOME_TOP_SKIN_HEADER_OFFSET,
      inlineTranslateY(document.getElementById("header")),
      skinOffset,
      0,
    );
    setHomeTopSkinOffset(
      HOME_TOP_SKIN_CONTENT_OFFSET,
      inlinePixels(document.getElementById("layout-body"), "paddingTop"),
      skinOffset,
      0,
    );
    setHomeTopSkinOffset(
      HOME_TOP_SKIN_SIDEBAR_OFFSET,
      inlineTranslateY(document.getElementById("sidebar")),
      skinOffset,
      60,
    );
    return selected;
  }

  function installHomeTopSkinAdSuppression() {
    if (typeof document !== "object") return;
    const MutationObserverConstructor = root.MutationObserver;
    if (typeof MutationObserverConstructor !== "function") return;
    let scheduled = false;
    let targetObserver = null;
    let observedTargets = [];
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      enqueueMicrotask(() => {
        scheduled = false;
        const skin = reconcileHomeTopSkinAd();
        const targets = [
          ...document.querySelectorAll(HOME_TOP_SKIN_SELECTOR),
          skin,
          document.getElementById("header"),
          document.getElementById("layout-body"),
          document.getElementById("sidebar"),
        ].filter((target, index, values) =>
          target ? values.indexOf(target) === index : false,
        );
        if (
          targets.length !== observedTargets.length ||
          targets.some((target, index) => target !== observedTargets[index])
        ) {
          targetObserver?.disconnect();
          targetObserver = new MutationObserverConstructor(schedule);
          for (const target of targets)
            targetObserver.observe(target, {
              attributeFilter: [
                "class",
                "style",
                "data-nlog-area",
                "data-nlog-params",
              ],
              attributes: true,
            });
          observedTargets = targets;
        }
      });
    };
    const documentObserver = new MutationObserverConstructor((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (
            (record.target instanceof Element &&
              record.target.closest(HOME_TOP_SKIN_SELECTOR)) ||
            (node instanceof Element &&
              (node.matches(
                `${HOME_TOP_SKIN_SELECTOR},#header,#layout-body,#sidebar`,
              ) ||
                node.querySelector(
                  `${HOME_TOP_SKIN_SELECTOR},#header,#layout-body,#sidebar`,
                )))
          ) {
            schedule();
            return;
          }
        }
      }
    });
    documentObserver.observe(document, { childList: true, subtree: true });
    hookRegistry.addCleanup("home top skin ad suppression", () => {
      documentObserver.disconnect();
      targetObserver?.disconnect();
      for (const element of document.querySelectorAll(
        `[${HOME_TOP_SKIN_MARKER}]`,
      ))
        element.removeAttribute(HOME_TOP_SKIN_MARKER);
      clearHomeTopSkinLayout();
    });
    schedule();
  }

  function installEarlyStyle() {
    const style = document.createElement("style");
    style.id = "chzzk-p2p-bypass-style";
    style.disabled = !CLEAN_SETTINGS.autoDismissPopup;
    style.textContent = `
      ${AUXILIARY_VIDEO_SELECTOR},
      ${AUXILIARY_UI_SELECTOR},
      video.${AUXILIARY_VIDEO_CLASS},
      [data-nlog-area="ad_blocking_info_layer"],
      [data-nlog-area^="ad_blocking_"] {
        position: fixed !important;
        inset: auto auto 0 0 !important;
        width: 1px !important;
        height: 1px !important;
        min-width: 0 !important;
        min-height: 0 !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        clip-path: inset(100%) !important;
        contain: strict !important;
      }

      ${VERIFIED_DISPLAY_AD_SELECTOR} {
        display: none !important;
        min-height: 0 !important;
      }

      [${HOME_TOP_SKIN_MARKER}] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        clip-path: inset(100%) !important;
      }

      html[${HOME_TOP_SKIN_ROOT_MARKER}] #header {
        transform: translateY(var(${HOME_TOP_SKIN_HEADER_OFFSET}, 0px)) !important;
      }

      html[${HOME_TOP_SKIN_ROOT_MARKER}] #layout-body {
        min-height: calc(100vh - 60px - var(${HOME_TOP_SKIN_CONTENT_OFFSET}, 0px)) !important;
        padding-top: var(${HOME_TOP_SKIN_CONTENT_OFFSET}, 0px) !important;
      }

      html[${HOME_TOP_SKIN_ROOT_MARKER}] #sidebar {
        height: calc(100vh - var(${HOME_TOP_SKIN_SIDEBAR_OFFSET}, 60px)) !important;
        transform: translateY(var(${HOME_TOP_SKIN_SIDEBAR_OFFSET}, 60px)) !important;
      }

      /* Hide only the stale unmuted notice. Runtime media state supplies the
         marker; localized labels are never used as state. */
      .pzp-mute-indicator[${UNMUTED_INDICATOR_MARKER}] {
        visibility: hidden !important;
        pointer-events: none !important;
      }

    `;

    const attach = () => {
      if (style.isConnected) {
        return true;
      }
      const existing = document.getElementById(style.id);
      if (existing && existing !== style) {
        reportIssue(
          "Early style installation",
          `Element id ${style.id} is already in use; installing an unnumbered style.`,
          "early-style-id-collision",
        );
        style.removeAttribute("id");
      }
      const parent = document.head || document.documentElement;
      if (!parent) {
        return false;
      }
      parent.append(style);
      for (const origin of EARLY_CONNECTION_ORIGINS) {
        preconnectOrigin(origin);
      }
      return true;
    };

    let observer = null;
    hookRegistry.addCleanup("early ad style", () => {
      observer?.disconnect();
      style.remove();
      for (const slot of document.querySelectorAll(`[${DISPLAY_AD_MARKER}]`))
        slot.removeAttribute(DISPLAY_AD_MARKER);
    });
    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) {
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true });
    }
  }

  function installPopupDismissObserver() {
    const AD_BLOCK_PATTERN = /광고\s*차단|애드블록|adblock|광고\s*방해없이|원활한\s*서비스\s*이용을\s*위해/i;
    const GRID_POPUP_PATTERN = /그리드\s*(프로그램)?\s*(설치|다운로드)|1080p\s*(화질)?\s*시청을\s*위해|고화질\s*시청을\s*위해|동영상\s*플러그인|플러그인\s*(설치|필요)|p2p/i;

    const checkElement = (node) => {
      if (!CLEAN_SETTINGS.autoDismissPopup) return;
      if (!(node instanceof HTMLElement)) return;

      const text = node.textContent || "";
      const isAdBlock = AD_BLOCK_PATTERN.test(text);
      const isGrid = GRID_POPUP_PATTERN.test(text);

      if (isAdBlock || isGrid) {
        const popupContainer =
          node.closest('[role="dialog"]') ||
          node.closest('[role="alertdialog"]') ||
          node.closest('[class*="popup_container"]') ||
          node.closest('[class*="modal"]') ||
          node.closest('[class*="layer_"]') ||
          node;

        if (popupContainer instanceof HTMLElement) {
          popupContainer.style.setProperty("display", "none", "important");
          popupContainer.style.setProperty("visibility", "hidden", "important");
          popupContainer.style.setProperty("pointer-events", "none", "important");

          const closeBtn =
            popupContainer.querySelector('button[class*="close"]') ||
            popupContainer.querySelector('button[class*="confirm"]') ||
            popupContainer.querySelector("button");

          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }

          root.setTimeout(() => {
            const video = document.querySelector("video");
            if (video && video.paused) {
              video.play().catch(() => {});
            }
          }, 150);
        }
      }

      if (node.querySelector?.('a[href*="ooadnieabchijkibjpeieeliohjidnjj"]') || (node.tagName === "A" && node.href?.includes("ooadnieabchijkibjpeieeliohjidnjj"))) {
        node.style.setProperty("display", "none", "important");
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (!CLEAN_SETTINGS.autoDismissPopup) return;
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added instanceof Element) {
            checkElement(added);
          }
        }
      }
    });

    const start = () => {
      const target = document.body || document.documentElement;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  // [ChzzkClean] 저지연 모드 엔진 (네이티브 저지연 활성화 + Live Edge Chaser)
  function installLowLatencyEngine() {
    let lastAppliedState = null;

    const syncNativeLowLatency = () => {
      const isLive = /^\/live\/[a-f0-9]{32}(?:\/|$)/i.test(root.location?.pathname ?? "");
      if (!isLive) return;

      const targetState = !!CLEAN_SETTINGS.lowLatencyMode;
      if (lastAppliedState === targetState) return;

      try {
        const playerEl =
          document.querySelector(".pzp-pc") ||
          document.querySelector(".pzp") ||
          document.querySelector('[class*="live_player"]');
        const store = root.__STORE__ || playerEl?.__vue__?.$store;
        if (store?.state) {
          store.dispatch?.("setLowLatency", targetState).catch?.(() => {});
          store.dispatch?.("updatePlayerState", { lowLatencyEnabled: targetState, lowLatency: targetState }).catch?.(() => {});
          store.commit?.("setLowLatency", targetState);
          store.commit?.("updatePlayerState", { lowLatencyEnabled: targetState, lowLatency: targetState });
          lastAppliedState = targetState;
          console.info(`${PREFIX} [ChzzkClean] 네이티브 저지연 모드 ${targetState ? "활성화" : "비활성화"}`);
        }
      } catch (e) {}
    };

    // 실시간 버퍼 지연 추적 및 복구 (Smart Live Sync & Buffer-aware Chaser)
    const traceLiveLatency = () => {
      const isLive = /^\/live\/[a-f0-9]{32}(?:\/|$)/i.test(root.location?.pathname ?? "");
      if (!isLive) return;

      const videos = document.querySelectorAll("video");
      for (const video of videos) {
        if (!video.isConnected || video.paused || video.ended || isAuxiliaryVideo(video)) {
          continue;
        }

        if (video.seekable && video.seekable.length > 0) {
          const liveEnd = video.seekable.end(video.seekable.length - 1);
          const latency = Math.max(0, liveEnd - video.currentTime);

          // 전방 버퍼(Forward Buffer) 길이 계산
          let forwardBuffer = 0;
          if (video.buffered && video.buffered.length > 0) {
            for (let i = 0; i < video.buffered.length; i++) {
              if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
                forwardBuffer = video.buffered.end(i) - video.currentTime;
                break;
              }
            }
          }

          if (CLEAN_SETTINGS.lowLatencyMode) {
            const target = typeof CLEAN_SETTINGS.targetLatency === "number" ? CLEAN_SETTINGS.targetLatency : 2.0;
            const diff = latency - target;

            // 1) 지연이 10초 이상 크게 누적된 경우 (버퍼링/일시정지 복구 후):
            // 무작정 끝으로 가지 않고 사용자가 지정한 목표 지연시간 위치로 점프!
            if (diff > 10.0) {
              video.currentTime = Math.max(0, liveEnd - target);
            }
            // 2) 버퍼가 너무 적으면(1.0초 미만) 가속 시 버퍼링이 발생하므로 즉시 1.0배속으로 버퍼 충전!
            else if (forwardBuffer < 1.0) {
              if (video.playbackRate > 1.0) video.playbackRate = 1.0;
            }
            // 3) 목표 지연시간보다 0.6초 이상 뒤처지고 버퍼가 1.2초 이상 충분할 때만 가속!
            else if (diff > 0.6 && forwardBuffer >= 1.2) {
              if (video.playbackRate !== 1.08) video.playbackRate = 1.08;
            }
            // 4) 너무 바짝 붙어서(목표치보다 0.4초 이상 앞섬) 버퍼 고갈 위험이 있을 때는 살짝 감속하여 버퍼 확보
            else if (diff < -0.4 && forwardBuffer < 1.5) {
              if (video.playbackRate !== 0.98) video.playbackRate = 0.98;
            }
            // 5) 목표 오차 범위 내 도달 시 정상 1.0배속 유지
            else {
              if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
            }
          } else {
            // 저지연 모드 OFF 시 정상 배속 복구
            if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
          }
        }
      }
    };

    root.setInterval(() => {
      syncNativeLowLatency();
      traceLiveLatency();
    }, 1000);

    root.addEventListener("popstate", () => {
      lastAppliedState = null;
      root.setTimeout(syncNativeLowLatency, 400);
    });
  }

  // [ChzzkClean] 채팅 입력창 실시간 지연시간/버퍼 표시 엔진
  function installChatLatencyDisplayEngine() {
    const updateLatencyBadge = () => {
      const isLive = /^\/live\/[a-f0-9]{32}(?:\/|$)/i.test(root.location?.pathname ?? "");
      const existingBadge = root.document?.getElementById("chzzk-clean-chat-latency");

      if (!isLive || !CLEAN_SETTINGS.chatLatencyDisplay) {
        if (existingBadge) existingBadge.remove();
        return;
      }

      // 채팅 입력창 컨테이너 탐색
      const inputContainer =
        root.document?.querySelector('[class*="live_chatting_input_container"]') ||
        root.document?.querySelector('[class*="chatting_input_area"]') ||
        root.document?.querySelector('[class*="live_chatting_input_box"]') ||
        root.document?.querySelector('form:has(textarea[placeholder*="채팅"])') ||
        root.document?.querySelector('div:has(> textarea[placeholder*="채팅"])') ||
        root.document?.querySelector('div:has(> [contenteditable="true"])') ||
        root.document?.querySelector('[class*="live_chatting_input"]');

      if (!inputContainer) return;

      if (root.getComputedStyle(inputContainer).position === "static") {
        inputContainer.style.position = "relative";
      }

      let badge = existingBadge;
      if (!badge) {
        badge = root.document.createElement("div");
        badge.id = "chzzk-clean-chat-latency";
        badge.style.cssText = `
          position: absolute;
          top: -22px;
          right: 4px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.5);
          background: rgba(0, 0, 0, 0.45);
          padding: 2px 7px;
          border-radius: 4px;
          user-select: none;
          pointer-events: none;
          white-space: nowrap;
          letter-spacing: -0.02em;
          z-index: 10;
          backdrop-filter: blur(4px);
          transition: color 0.2s ease;
        `;
        inputContainer.appendChild(badge);
      }

      const video = root.document?.querySelector("video");
      if (!video || !video.isConnected) {
        badge.textContent = "지연: 대기 중...";
        badge.style.color = "rgba(255, 255, 255, 0.4)";
        return;
      }
      if (video.paused) {
        badge.textContent = "지연: 일시정지됨";
        badge.style.color = "rgba(255, 255, 255, 0.4)";
        return;
      }

      let latency = -1;
      let buffer = 0;

      if (video.seekable && video.seekable.length > 0) {
        const liveEnd = video.seekable.end(video.seekable.length - 1);
        latency = Math.max(0, liveEnd - video.currentTime);
      }

      if (video.buffered && video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (video.currentTime >= start && video.currentTime <= end) {
            buffer = Math.max(0, end - video.currentTime);
            break;
          }
        }
      }

      if (latency >= 0) {
        badge.textContent = `지연: ${latency.toFixed(2)}s (버퍼 ${buffer.toFixed(1)}s)`;
        if (latency < 2.5) {
          badge.style.color = "#00ffa3"; // 양호 (민트)
        } else if (latency < 4.0) {
          badge.style.color = "#ffb800"; // 보통 (노랑)
        } else {
          badge.style.color = "#ff5555"; // 지연 심함 (빨강)
        }
      } else {
        badge.textContent = "지연: 측정 중...";
        badge.style.color = "rgba(255, 255, 255, 0.4)";
      }
    };

    root.setInterval(updateLatencyBadge, 500);
  }

  function hasAdMediaSource(video, source = video.currentSrc || video.src) {
    if (!source || source.startsWith("blob:")) {
      return false;
    }
    try {
      const url = new URL(source, location.href);
      return (
        AD_MEDIA_HOST.test(url.hostname) ||
        (url.hostname === "api.chzzk.naver.com" &&
          url.pathname.startsWith("/service/t/"))
      );
    } catch {
      return false;
    }
  }

  function isAuxiliaryVideo(video, fresh = false) {
    if (!(video instanceof HTMLVideoElement)) {
      return false;
    }
    if (!fresh && video.classList.contains(AUXILIARY_VIDEO_CLASS)) {
      return true;
    }
    const parent = video.parentElement;
    const cached = auxiliaryVideoCache.get(video);
    if (
      !fresh &&
      cached?.revision === auxiliaryDomRevision &&
      cached.parent === parent
    ) {
      return cached.auxiliary;
    }
    const declaredSource = video.hasAttribute("src") ? video.src : "";
    const source =
      (fresh && declaredSource) || video.currentSrc || video.src || "";
    const auxiliary =
      Boolean(video.closest(AUXILIARY_VIDEO_SELECTOR)) ||
      hasAdMediaSource(video, source);
    auxiliaryVideoCache.set(video, {
      auxiliary,
      parent,
      revision: auxiliaryDomRevision,
      source,
    });
    return auxiliary;
  }

  function findPrimaryPlaybackVideo(preferred) {
    if (
      preferred instanceof HTMLVideoElement &&
      document.pictureInPictureElement === preferred &&
      !isAuxiliaryVideo(preferred)
    ) {
      return preferred;
    }
    const chooseBest = (candidates) => {
      let primary = null;
      let bestScore = -Infinity;
      for (const video of candidates) {
        if (isAuxiliaryVideo(video)) {
          continue;
        }
        const area = Math.max(
          video.videoWidth * video.videoHeight,
          video.clientWidth * video.clientHeight,
        );
        const score =
          (video.currentSrc || video.src ? 1_000_000_000 : 0) +
          (!video.ended ? 100_000_000 : 0) +
          video.readyState * 1_000_000 +
          area;
        if (score >= bestScore) {
          bestScore = score;
          primary = video;
        }
      }
      return primary;
    };
    // Official players can coexist in one document. Keep recovery and DVR
    // decisions inside the owning player; unrelated custom HLS stays separate.
    const scope = preferred?.closest?.(PLAYER_SCOPE_SELECTOR) ?? document;
    const designated = chooseBest(
      scope.querySelectorAll("video[data-role='videoEl']"),
    );
    if (designated) {
      return designated;
    }
    return chooseBest(scope.querySelectorAll("video"));
  }

  function reconcileMuteIndicator(player) {
    if (!(player instanceof Element) || !player.matches(".pzp")) return;
    const preferred = player.querySelector("video[data-role='videoEl'],video");
    const video = findPrimaryPlaybackVideo(preferred);
    for (const indicator of player.querySelectorAll(".pzp-mute-indicator"))
      indicator.toggleAttribute(
        UNMUTED_INDICATOR_MARKER,
        !!video && !video.muted,
      );
  }

  function installMuteIndicatorState() {
    if (
      typeof document !== "object" ||
      typeof root.MutationObserver !== "function"
    )
      return;
    let scheduled = false;
    const pending = new Set();
    const schedule = (player) => {
      if (player?.matches?.(".pzp")) pending.add(player);
      if (scheduled) return;
      scheduled = true;
      enqueueMicrotask(() => {
        scheduled = false;
        if (pending.size === 0)
          for (const player of document.querySelectorAll(".pzp"))
            pending.add(player);
        for (const player of pending) reconcileMuteIndicator(player);
        pending.clear();
      });
    };
    const onVolumeChange = (event) => schedule(event.target?.closest?.(".pzp"));
    const observer = new root.MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches(".pzp-mute-indicator,video") ||
            node.querySelector(".pzp-mute-indicator,video")
          )
            schedule(node.closest(".pzp") || node.querySelector(".pzp"));
        }
      }
    });
    hookRegistry.addCleanup("mute indicator state", () => {
      observer.disconnect();
      document.removeEventListener("volumechange", onVolumeChange, true);
      for (const indicator of document.querySelectorAll(
        `[${UNMUTED_INDICATOR_MARKER}]`,
      ))
        indicator.removeAttribute(UNMUTED_INDICATOR_MARKER);
    });
    document.addEventListener("volumechange", onVolumeChange, true);
    observer.observe(document, { childList: true, subtree: true });
    schedule();
  }
  // Delayed work belongs to one navigation and one physical media lifetime.
  // URL equality alone misses A -> B -> A, and currentSrc can lag behind src.
  let playbackNavigationVersion = 0;
  let playbackNavigationPath = root.location?.pathname ?? "";
  const playbackNavigationSubscribers = new Set();
  const playbackMediaVersions = new WeakMap();
  const rejectedPlaybackTaskScopes = new WeakSet();
  let playbackScopeObserver = null;
  const invalidatePlaybackNode = (node) =>
    playbackMediaVersions.set(node, (playbackMediaVersions.get(node) ?? 0) + 1);
  const consumePlaybackScopeMutations = (records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const node = record.target;
        if (node.matches?.("video,iframe")) invalidatePlaybackNode(node);
        else if (node.matches?.("source")) {
          const video = node.closest("video");
          if (video) invalidatePlaybackNode(video);
        }
        continue;
      }
      if (
        record.target.matches?.("video") &&
        [...record.addedNodes, ...record.removedNodes].some(
          (node) => node.nodeType === 1 && node.matches("source"),
        )
      )
        invalidatePlaybackNode(record.target);
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("video,iframe,.pzp-midroll-dimmed"))
          invalidatePlaybackNode(node);
        for (const media of node.querySelectorAll(
          "video,iframe,.pzp-midroll-dimmed",
        ))
          invalidatePlaybackNode(media);
      }
    }
  };
  const flushPlaybackScopeMutations = () => {
    if (playbackScopeObserver)
      consumePlaybackScopeMutations(playbackScopeObserver.takeRecords());
  };

  function refreshPlaybackNavigation(force = false) {
    const path = root.location?.pathname ?? "";
    if (!force && path === playbackNavigationPath)
      return playbackNavigationVersion;
    playbackNavigationPath = path;
    playbackNavigationVersion += 1;
    for (const subscriber of playbackNavigationSubscribers) {
      try {
        subscriber();
      } catch (error) {
        reportFailure("Playback navigation subscriber", error);
      }
    }
    return playbackNavigationVersion;
  }
  function subscribePlaybackNavigation(subscriber, label) {
    playbackNavigationSubscribers.add(subscriber);
    hookRegistry.addCleanup(label, () =>
      playbackNavigationSubscribers.delete(subscriber),
    );
  }
  function capturePlaybackTaskScope(node) {
    try {
      flushPlaybackScopeMutations();
      const media = node instanceof root.HTMLMediaElement;
      return Object.freeze({
        node,
        parent: node.parentNode,
        player: node.closest?.(PLAYER_SCOPE_SELECTOR) ?? null,
        route: root.location?.pathname ?? "",
        navigation: refreshPlaybackNavigation(),
        mediaVersion: playbackMediaVersions.get(node) ?? 0,
        source: media ? node.currentSrc : null,
        declaredSource: media ? node.getAttribute("src") : null,
        sourceObject: media ? node.srcObject : null,
      });
    } catch {
      return null;
    }
  }
  function isPlaybackTaskCurrent(scope) {
    let valid = false;
    try {
      flushPlaybackScopeMutations();
      const node = scope?.node;
      valid = Boolean(
        node &&
        installation.status === "active" &&
        node.isConnected &&
        scope.navigation === refreshPlaybackNavigation() &&
        scope.route === (root.location?.pathname ?? "") &&
        scope.parent === node.parentNode &&
        scope.player === (node.closest?.(PLAYER_SCOPE_SELECTOR) ?? null) &&
        scope.mediaVersion === (playbackMediaVersions.get(node) ?? 0) &&
        (scope.source === null ||
          (scope.source === node.currentSrc &&
            scope.declaredSource === node.getAttribute("src") &&
            scope.sourceObject === node.srcObject)),
      );
    } catch {
      /* Unknown ownership is not permission to run old work. */
    }
    if (!valid && scope && !rejectedPlaybackTaskScopes.has(scope)) {
      rejectedPlaybackTaskScopes.add(scope);
      stats.stalePlaybackTasksPrevented += 1;
    }
    return valid;
  }
  function installPlaybackTaskScope() {
    if (!root.document?.addEventListener) return;
    if (root.MutationObserver) {
      playbackScopeObserver = new root.MutationObserver(
        consumePlaybackScopeMutations,
      );
      playbackScopeObserver.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
      hookRegistry.addCleanup("playback task DOM lifetimes", () => {
        playbackScopeObserver.disconnect();
        playbackScopeObserver = null;
      });
    }
    // Update the epoch synchronously after successful native history calls.
    // Subscriber failures cannot alter native return values or exceptions.
    for (const name of ["pushState", "replaceState"]) {
      const method = root.history && findMethodDescriptor(root.history, name);
      if (!method || typeof method.descriptor.value !== "function") continue;
      const nativeMethod = method.descriptor.value;
      hookRegistry.define(
        method.owner,
        name,
        {
          ...method.descriptor,
          value: function (...args) {
            const result = Reflect.apply(nativeMethod, this, args);
            try {
              refreshPlaybackNavigation();
            } catch (error) {
              reportFailure("Playback navigation tracking", error);
            }
            return result;
          },
        },
        `History.prototype.${name}`,
      );
    }
    addManagedEventListener(
      root,
      "popstate",
      () => refreshPlaybackNavigation(),
      true,
      "playback navigation popstate",
    );
    addManagedEventListener(
      root,
      "pagehide",
      () => refreshPlaybackNavigation(true),
      true,
      "playback navigation pagehide",
    );
    addManagedEventListener(
      root,
      "pageshow",
      (event) => {
        if (event.persisted) refreshPlaybackNavigation(true);
      },
      true,
      "playback navigation pageshow",
    );
    for (const type of ["loadstart", "emptied"])
      addManagedEventListener(
        document,
        type,
        (event) => {
          if (event.target instanceof root.HTMLMediaElement)
            playbackMediaVersions.set(
              event.target,
              (playbackMediaVersions.get(event.target) ?? 0) + 1,
            );
        },
        true,
        `playback media lifetime ${type}`,
      );
  }
  function installVodVolumeKeyboardFocus() {
    if (
      !root.document ||
      !root.HTMLElement ||
      !root.HTMLVideoElement ||
      typeof root.document.addEventListener !== "function" ||
      root.location?.hostname === "m.chzzk.naver.com"
    )
      return;
    const pending = new WeakMap();
    const restorations = new Map();
    const restoreFocus = (state) => {
      if (
        document.activeElement === state.player &&
        state.focus.isConnected &&
        state.player.contains(state.focus) &&
        isPlaybackTaskCurrent(state.scope) &&
        currentPlaybackRoute() === state.route
      )
        state.focus.focus({ preventScroll: true });
    };
    hookRegistry.addCleanup("VOD volume focus restoration", () => {
      for (const [timer, state] of restorations) {
        root.clearTimeout(timer);
        restoreFocus(state);
      }
      restorations.clear();
    });
    const eligible = (event) => {
      if (
        !event.isTrusted ||
        !document.hasFocus() ||
        event.isComposing ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !["ArrowUp", "ArrowDown"].includes(event.key) ||
        !/^\/video\/\d+(?:\/|$)/.test(root.location?.pathname ?? "")
      )
        return null;
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.isContentEditable ||
        target.closest(AUXILIARY_VIDEO_SELECTOR) ||
        (target instanceof HTMLVideoElement && isAuxiliaryVideo(target)) ||
        target.closest(
          "input,textarea,select,pre,[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='combobox'],[role='menu'],[role='listbox'],[role='dialog'],.pzp-contextmenu-pane,.pzp-setting-pane",
        )
      )
        return null;
      const player = target.closest(".pzp.pzp-pc.pzp-pc--vod");
      const focus = document.activeElement;
      if (
        !player ||
        !(focus instanceof HTMLElement) ||
        focus === player ||
        !player.contains(focus) ||
        focus.closest(PLAYER_SCOPE_SELECTOR) !== player
      )
        return null;
      const slider = target.closest("[role='slider']");
      const progress = !!target.closest(".pzp-progress-slider");
      if (slider && !progress) return null;
      if (event.defaultPrevented && !progress) return null;
      const video = player.querySelector(
        "video[data-role='videoEl'],video.webplayer-internal-video",
      );
      if (!video || isAuxiliaryVideo(video)) return null;
      return {
        player,
        focus,
        video,
        route: currentPlaybackRoute(),
        volume: video.volume,
        muted: video.muted,
        scope: capturePlaybackTaskScope(video),
      };
    };
    addManagedEventListener(
      document,
      "keydown",
      (event) => {
        const state = eligible(event);
        if (state) pending.set(event, state);
      },
      true,
      "VOD volume focus capture",
    );
    // The SDK prevents arrows even when its volume command is disabled. The
    // app's window handler still requires the layout itself to have focus.
    // Keep the same trusted event and official volume/UI/storage behavior.
    addManagedEventListener(
      document,
      "keydown",
      (event) => {
        const state = pending.get(event);
        pending.delete(event);
        const current = state && eligible(event);
        if (
          !current ||
          current.player !== state.player ||
          current.focus !== state.focus ||
          current.video !== state.video ||
          current.route !== state.route ||
          !isPlaybackTaskCurrent(state.scope) ||
          current.volume !== state.volume ||
          current.muted !== state.muted
        )
          return;
        state.player.focus({ preventScroll: true });
        if (document.activeElement !== state.player) return;
        event.preventDefault();
        stats.vodVolumeFocusRepairs += 1;
        // Trusted DOM dispatch checkpoints microtasks between listeners.
        // Restore in the next task, after the app's window handler has run.
        const timer = root.setTimeout(() => {
          restorations.delete(timer);
          restoreFocus(state);
        }, 0);
        restorations.set(timer, state);
      },
      false,
      "VOD volume focus repair",
    );
  }
  const PLAYER_PREFERENCES_KEY = "chzzk-p2p-bypass.player-preferences.v1";
  const CLIP_PREFERENCES_MESSAGE = "chzzk-p2p-bypass.clip-preferences.v1";
  const validClipBridgeId = (value) =>
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 80 &&
    /^[a-z0-9.-]+$/i.test(value);
  const newClipBridgeId = () => {
    try {
      if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  };
  const preferenceStorage = (() => {
    try {
      return root.localStorage;
    } catch {
      return null;
    }
  })();
  const nativePreferenceGet = root.Storage?.prototype.getItem;
  const nativePreferenceSet = root.Storage?.prototype.setItem;
  const emptyPlayerPreferences = () => ({ audio: {}, quality: {} });
  const validVolume = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
  const sanitizeAudioPreference = (value) => {
    if (!isRecord(value)) return null;
    const audio = {};
    if (validVolume(value.volume)) audio.volume = value.volume;
    if (typeof value.muted === "boolean") audio.muted = value.muted;
    return Object.keys(audio).length ? audio : null;
  };
  const sanitizeQualityPreference = (value) => {
    if (!isRecord(value)) return null;
    if (value.mode === "auto") return { mode: "auto" };
    if (
      value.mode !== "fixed" ||
      !Number.isFinite(value.resolution) ||
      value.resolution <= 0 ||
      value.resolution > 16384
    )
      return null;
    return {
      mode: "fixed",
      resolution: value.resolution,
      kind: typeof value.kind === "string" ? value.kind.slice(0, 64) : "",
    };
  };
  const sanitizePlayerPreferences = (value) => {
    const result = emptyPlayerPreferences();
    for (const type of ["main", "clip"]) {
      const audio = sanitizeAudioPreference(value?.audio?.[type]);
      if (audio) result.audio[type] = audio;
    }
    for (const type of ["live", "vod", "clip"]) {
      const quality = sanitizeQualityPreference(value?.quality?.[type]);
      if (quality) result.quality[type] = quality;
    }
    return result;
  };
  function readPlayerPreferences() {
    try {
      return sanitizePlayerPreferences(
        nativeJsonParse(
          Reflect.apply(nativePreferenceGet, preferenceStorage, [
            PLAYER_PREFERENCES_KEY,
          ]),
        ),
      );
    } catch {
      return emptyPlayerPreferences();
    }
  }
  function writePlayerPreference(section, type, value) {
    try {
      const preferences = readPlayerPreferences();
      const sanitized =
        section === "audio"
          ? sanitizeAudioPreference(value)
          : sanitizeQualityPreference(value);
      if (!sanitized) return;
      preferences[section][type] = sanitized;
      Reflect.apply(nativePreferenceSet, preferenceStorage, [
        PLAYER_PREFERENCES_KEY,
        nativeJsonStringify(preferences),
      ]);
      stats.playerPreferenceSaves += 1;
    } catch {
      /* Storage denied or full: preserve official controls. */
    }
  }
  const preferenceRouteType = () =>
    /^\/live\/[a-f0-9]{32}(?:\/|$)/i.test(root.location?.pathname ?? "")
      ? "live"
      : /^\/video\/\d+(?:\/|$)/.test(root.location?.pathname ?? "")
        ? "vod"
        : /^\/clips\/[^/]+/.test(root.location?.pathname ?? "")
          ? "clip"
          : null;
  const automaticVideoTrack = (track) =>
    track?.label === "ABR" || track?.label === "auto" || track?.kind === "auto";
  const videoTrackResolution = (track) =>
    Math.min(
      Number(track?.width) || Number(track?.height) || 0,
      Number(track?.height) || Number(track?.width) || 0,
    );
  function preferenceForTrack(track) {
    return automaticVideoTrack(track)
      ? { mode: "auto" }
      : sanitizeQualityPreference({
          mode: "fixed",
          resolution: videoTrackResolution(track),
          kind: track?.kind,
        });
  }
  function preferredVideoTrack(tracks, preference) {
    if (!preference) return null;
    if (preference.mode === "auto")
      return tracks.find(automaticVideoTrack) ?? null;
    const candidates = tracks.filter(
      (track) =>
        !automaticVideoTrack(track) &&
        videoTrackResolution(track) > 0 &&
        videoTrackResolution(track) <= preference.resolution,
    );
    candidates.sort(
      (a, b) =>
        videoTrackResolution(b) - videoTrackResolution(a) ||
        Number(b.kind === preference.kind) - Number(a.kind === preference.kind),
    );
    return candidates[0] ?? null;
  }
  const preferenceEditable = (target) =>
    !(target instanceof root.Element) ||
    target.isContentEditable ||
    !!target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='combobox'],[role='dialog'],[role='menu'],[role='listbox']",
    );
  const MAIN_AUDIO_CONTROL =
    ".pzp-volume-button,.pzp-volume-slider,.pzp-volume-toggle,.pzp-mute-button,.pzp-pc__volume-control,pzp-volume-button,pzp-volume-slider,pzp-pc-volume-button,pzp-pc-volume-slider,pzp-volume-toggle";
  const MAIN_QUALITY_CONTROL =
    "pzp-pc-setting-quality-pane,pzp-setting-quality-pane,.pzp-pc__setting-quality-pane,.pzp-setting-quality-pane";
  // Observe activation after the native event dispatch; do not consume a key,
  // toggle playback, or undo the mute/volume choice made by that same event.
  function installPreferredSoundGesture(
    resolve,
    restoreSound,
    excluded,
    playbackControls,
  ) {
    const timers = new Set();
    hookRegistry.addCleanup("preferred sound activation tasks", () => {
      for (const timer of timers) root.clearTimeout(timer);
      timers.clear();
    });
    const listener = (event) => {
      if (
        !event.isTrusted ||
        !document.hasFocus() ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        preferenceEditable(event.target) ||
        event.target.closest(excluded) ||
        (event.target.closest("button,[role='button']") &&
          !event.target.closest(playbackControls)) ||
        (event.type === "click" && event.button !== 0) ||
        (event.type === "keydown" &&
          (event.repeat ||
            [
              "m",
              "ㅡ",
              "arrowup",
              "arrowdown",
              "=",
              "-",
              "escape",
              "tab",
            ].includes(event.key.toLowerCase())))
      )
        return;
      const owner = resolve();
      if (!owner) return;
      const scope = capturePlaybackTaskScope(owner.video);
      const timer = root.setTimeout(() => {
        timers.delete(timer);
        if (
          resolve() !== owner ||
          !isPlaybackTaskCurrent(scope) ||
          !root.navigator?.userActivation?.isActive ||
          event.defaultPrevented
        )
          return;
        try {
          restoreSound(owner);
        } catch (error) {
          reportFailure("Preferred sound gesture", error);
        }
      }, 0);
      timers.add(timer);
    };
    for (const type of ["click", "keydown"])
      addManagedEventListener(
        root,
        type,
        listener,
        true,
        `preferred sound activation ${type}`,
      );
  }
  function mainPlayerApi(player, video) {
    const owns = (api) => {
      try {
        return (
          api &&
          api.videoTracks &&
          "volume" in api &&
          "muted" in api &&
          (api._corePlayer?.player?.video === video ||
            api._corePlayer?.player?._videoElement === video ||
            api._corePlayer?.shadowRoot?.contains?.(video) ||
            api.querySelector?.(
              "video.webplayer-internal-video,video[data-role='videoEl']",
            ) === video)
        );
      } catch {
        return false;
      }
    };
    if (owns(player)) return player;
    const app = document.getElementById("root");
    if (!app?.contains(player)) return null;
    for (
      let element = player, depth = 0;
      element && depth < 12;
      element = element.parentElement, depth++
    ) {
      let fiber = committedReactFiber(element, app);
      for (
        let depth = 0;
        fiber && depth < 48;
        depth++, fiber = reactDataValue(fiber, "return")
      ) {
        let hook = reactDataValue(fiber, "memoizedState");
        for (
          let count = 0;
          hook && count < 64;
          count++, hook = reactDataValue(hook, "next")
        ) {
          const value = reactDataValue(hook, "memoizedState");
          for (const api of [value, reactDataValue(value, "current")])
            if (owns(api)) return api;
        }
      }
    }
    return null;
  }
  function seedOfficialAudioPreference(type, refresh = false) {
    const existing = readPlayerPreferences().audio[type];
    if (existing && !refresh) return existing;
    try {
      const prefix = type === "clip" ? "clip-viewer" : "player";
      const volume = nativeJsonParse(
        Reflect.apply(nativePreferenceGet, preferenceStorage, [
          `${prefix}-volume`,
        ]),
      );
      const muted = nativeJsonParse(
        Reflect.apply(nativePreferenceGet, preferenceStorage, [
          `${prefix}-volume-muted`,
        ]),
      );
      const preference = sanitizeAudioPreference({
        volume:
          type === "clip" && typeof volume === "number"
            ? volume / 100
            : volume?.value,
        muted,
      });
      if (preference)
        writePlayerPreference("audio", type, { ...existing, ...preference });
      return preference ? { ...existing, ...preference } : existing;
    } catch {
      return existing;
    }
  }
  function saveOfficialAudioPreference(type, audio) {
    if (!validVolume(audio?.volume) || typeof audio?.muted !== "boolean")
      return;
    writePlayerPreference("audio", type, audio);
    try {
      const prefix = type === "clip" ? "clip-viewer" : "player";
      Reflect.apply(nativePreferenceSet, preferenceStorage, [
        `${prefix}-volume`,
        nativeJsonStringify(
          type === "clip"
            ? Math.round(audio.volume * 100)
            : { value: audio.volume },
        ),
      ]);
      Reflect.apply(nativePreferenceSet, preferenceStorage, [
        `${prefix}-volume-muted`,
        nativeJsonStringify(audio.muted),
      ]);
    } catch {
      /* An unavailable store must not break media controls. */
    }
  }
  function installPlayerPreferences() {
    if (
      !root.document?.addEventListener ||
      !root.HTMLMediaElement ||
      !root.MutationObserver ||
      root.location?.hostname !== "chzzk.naver.com" ||
      !preferenceStorage ||
      !nativePreferenceSet
    )
      return;
    if (preferenceRouteType())
      seedOfficialAudioPreference(
        preferenceRouteType() === "clip" ? "clip" : "main",
        true,
      );
    const entries = new Map();
    const managedClipFrames = new WeakMap();
    const pendingClipFrames = new WeakMap();
    const requestClipBindings = () => {
      if (preferenceRouteType() !== "clip") return;
      for (const frame of document.querySelectorAll("iframe")) {
        const binding = managedClipFrames.get(frame);
        if (binding && frame.src === binding.url)
          frame.contentWindow.postMessage(
            {
              channel: CLIP_PREFERENCES_MESSAGE,
              type: "request-ready",
              documentId: binding.documentId,
            },
            "https://m.naver.com",
          );
      }
    };
    const timers = new Set();
    const defer = (callback, delay = 0) => {
      const timer = root.setTimeout(() => {
        timers.delete(timer);
        try {
          callback();
        } catch (error) {
          reportFailure("Player preferences task", error);
        }
      }, delay);
      timers.add(timer);
    };
    const activeEntry = (video) =>
      [...entries.values()].find(
        (entry) =>
          entry.video === video &&
          video.isConnected &&
          entry.player.contains(video) &&
          entry.player.isConnected &&
          entry.navigation === refreshPlaybackNavigation() &&
          entry.route === root.location.pathname,
      );
    const saveQuality = (entry, event) => {
      if (
        entry.applying ||
        entry.route !== root.location.pathname ||
        entry.navigation !== refreshPlaybackNavigation() ||
        !entry.intent?.quality ||
        entry.intent.until < monotonicNow()
      )
        return;
      const tracks = Array.from(entry.api.videoTracks ?? []),
        track = event.detail?.track;
      if (!tracks.includes(track)) return;
      writePlayerPreference("quality", entry.type, preferenceForTrack(track));
      entry.qualitySignature = tracks
        .map((item) => `${item.id}:${item.label}:${item.kind}`)
        .join("|");
      entry.qualityTracks = tracks;
      entry.userManualQuality = true;
      entry.intent.quality = false;
    };
    const restore = (entry) => {
      if (
        entries.size !== 1 ||
        !entry.video.isConnected ||
        !entry.player.contains(entry.video) ||
        !entry.player.isConnected ||
        entry.route !== root.location.pathname ||
        isAuxiliaryVideo(entry.video)
      )
        return;
      if (!entry.audioRestored) {
        const audio = seedOfficialAudioPreference("main");
        if (audio) {
          entry.applying = true;
          try {
            if (validVolume(audio.volume) && entry.api.volume !== audio.volume)
              entry.api.volume = audio.volume;
            // A saved unmute is not autoplay permission. Do not unmute the
            // browser's fallback and pause playback before a real gesture.
            if (
              audio.muted === true ||
              (audio.muted === false &&
                (!entry.video.muted ||
                  root.navigator?.userActivation?.isActive))
            )
              entry.api.muted = audio.muted;
            stats.playerPreferenceRestores += 1;
          } finally {
            entry.applying = false;
          }
        }
        entry.audioRestored = true;
      }
      if (!CLEAN_SETTINGS.gridBypassEnabled) return;
      if (entry.video.paused || entry.video.playbackRate === 0) return;
      const tracks = Array.from(entry.api.videoTracks ?? []);
      if (!tracks.length) return;
      let quality = readPlayerPreferences().quality[entry.type];
      if (CLEAN_SETTINGS.gridBypassEnabled && !entry.userManualQuality) {
        // 1080p 고정 옵션 활성화 시 새 방송 진입마다 최고 화질(1080p) 자동 고정
        quality = { mode: "fixed", resolution: 1080 };
      }
      const signature = tracks
        .map((track) => `${track.id}:${track.label}:${track.kind}`)
        .join("|");
      if (
        entry.qualitySignature === signature &&
        entry.qualityTracks?.length === tracks.length &&
        entry.qualityTracks.every((track, index) => track === tracks[index])
      )
        return;
      entry.qualitySignature = signature;
      entry.qualityTracks = tracks;
      const track = preferredVideoTrack(tracks, quality);
      if (track && !track.selected) {
        entry.applying = true;
        try {
          track.selected = true;
          stats.playerPreferenceRestores += 1;
        } finally {
          entry.applying = false;
        }
      }
    };
    const scan = () => {
      for (const [player, entry] of entries)
        if (
          !player.isConnected ||
          !player.matches(".pzp.pzp-pc") ||
          !entry.video.isConnected ||
          !player.contains(entry.video) ||
          entry.route !== root.location.pathname ||
          entry.navigation !== refreshPlaybackNavigation()
        ) {
          entry.release?.();
          entries.delete(player);
        }
      const type = preferenceRouteType();
      if (type !== "live" && type !== "vod") return;
      for (const player of document.querySelectorAll(".pzp.pzp-pc")) {
        const videos = [
          ...player.querySelectorAll(
            "video[data-role='videoEl'],video.webplayer-internal-video",
          ),
        ].filter((video) => !isAuxiliaryVideo(video));
        if (videos.length !== 1) continue;
        const api = mainPlayerApi(player, videos[0]);
        if (!api) continue;
        let entry = entries.get(player);
        // A reused SDK wrapper can acquire a new physical video. Its old
        // restored flags and user intents do not belong to that new owner.
        if (entry && (entry.api !== api || entry.video !== videos[0])) {
          entry.release?.();
          entries.delete(player);
          entry = null;
        }
        if (!entry) {
          entry = {
            player,
            api,
            video: videos[0],
            route: root.location.pathname,
            navigation: refreshPlaybackNavigation(),
            type,
            applying: false,
            audioRestored: false,
            qualitySignature: "",
            intent: null,
          };
          entries.set(player, entry);
          const pane =
            api.querySelector?.("pzp-pc-setting-quality-pane") ??
            api.querySelector?.("pzp-setting-quality-pane");
          if (pane?.addEventListener && pane?.removeEventListener) {
            const listener = (event) => {
              try {
                saveQuality(entry, event);
              } catch (error) {
                reportFailure("User quality preference", error);
              }
            };
            pane.addEventListener("change", listener);
            entry.release = () => pane.removeEventListener("change", listener);
          }
        }
      }
      for (const entry of entries.values()) restore(entry);
    };
    let queued = false;
    const scheduleScan = () => {
      if (!queued) {
        queued = true;
        defer(() => {
          queued = false;
          scan();
        });
      }
    };
    subscribePlaybackNavigation(() => {
      scheduleScan();
      requestClipBindings();
    }, "player preference navigation subscription");
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node.nodeType === 1 &&
              (node.matches?.(".pzp,video,iframe") ||
                node.querySelector?.(".pzp,video,iframe")),
          ),
        )
      ) {
        scheduleScan();
        defer(requestClipBindings);
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    hookRegistry.addCleanup("player preference lifecycle", () => {
      observer.disconnect();
      for (const timer of timers) root.clearTimeout(timer);
      timers.clear();
      for (const entry of entries.values()) entry.release?.();
      entries.clear();
    });
    for (const name of ["loadedmetadata", "canplay", "playing"])
      addManagedEventListener(
        document,
        name,
        scheduleScan,
        true,
        `preferences ${name}`,
      );
    for (const name of ["popstate", "pageshow"])
      addManagedEventListener(
        root,
        name,
        scheduleScan,
        true,
        `preferences ${name}`,
      );
    const capture = (event) => {
      if (!event.isTrusted || !document.hasFocus() || event.isComposing) return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.isContentEditable ||
        target.closest(
          "textarea,select,[role='textbox'],[contenteditable]:not([contenteditable='false'])",
        )
      )
        return;
      // Record the actual setter reached by the official window-wide volume
      // keys, including headers and menus; never consume or synthesize a key.
      if (
        event.type === "keydown" &&
        ["m", "ㅡ", "arrowup", "arrowdown"].includes(event.key.toLowerCase()) &&
        (!target.closest("input,[role='combobox']") ||
          target.closest(MAIN_AUDIO_CONTROL))
      ) {
        for (const owner of entries.values()) {
          if (
            owner.route !== root.location.pathname ||
            !owner.video.isConnected ||
            !owner.player.contains(owner.video)
          )
            continue;
          const intent = {
            audio: true,
            quality: false,
            until: monotonicNow() + 1200,
            scope: capturePlaybackTaskScope(owner.video),
          };
          owner.intent = intent;
          defer(() => {
            if (owner.intent === intent) intent.audio = false;
          });
        }
        return;
      }
      const player =
        target.closest(".pzp.pzp-pc") ??
        (target === document.body
          ? entries.size === 1
            ? [...entries.keys()][0]
            : null
          : null);
      const entry = entries.get(player);
      if (
        !entry ||
        entry.route !== root.location.pathname ||
        isAuxiliaryVideo(entry.video) ||
        target.closest(AUXILIARY_VIDEO_SELECTOR)
      )
        return;
      let audio = false,
        quality = false;
      if (event.type === "keydown") {
        quality =
          ["Enter", " "].includes(event.key) &&
          !!target.closest(MAIN_QUALITY_CONTROL);
        if (quality) {
          entry.intent = {
            audio: false,
            quality: true,
            until: monotonicNow() + 1200,
            scope: capturePlaybackTaskScope(entry.video),
          };
          return;
        }
        if (
          !target.closest(MAIN_AUDIO_CONTROL) &&
          (preferenceEditable(target) ||
            target.closest(".pzp-setting-pane,.pzp-contextmenu-pane"))
        )
          return;
        const key = event.key.toLowerCase();
        audio =
          ["m", "ㅡ", "ArrowUp", "ArrowDown"].includes(event.key) ||
          key === "m";
      } else {
        audio = !!target.closest(MAIN_AUDIO_CONTROL);
        quality = !!target.closest(MAIN_QUALITY_CONTROL);
      }
      if (!audio && !quality) return;
      const intent = {
        audio,
        quality,
        until: monotonicNow() + 1200,
        scope: capturePlaybackTaskScope(entry.video),
      };
      entry.intent = intent;
      if (audio)
        defer(() => {
          if (entry.intent === intent) intent.audio = false;
        });
    };
    for (const type of [
      "pointerdown",
      "pointermove",
      "click",
      "input",
      "change",
      "keydown",
    ])
      addManagedEventListener(
        document,
        type,
        capture,
        true,
        `preferences user ${type}`,
      );
    const restorePreferredSound = (entry) => {
      const audio = readPlayerPreferences().audio.main;
      if (
        entries.size !== 1 ||
        activeEntry(entry.video) !== entry ||
        !entry.player.matches(".pzp.pzp-pc") ||
        mainPlayerApi(entry.player, entry.video) !== entry.api ||
        isAuxiliaryVideo(entry.video) ||
        audio?.muted !== false ||
        !validVolume(audio.volume) ||
        audio.volume === 0 ||
        !entry.video.muted
      )
        return;
      entry.applying = true;
      try {
        entry.api.muted = false;
        stats.playerPreferenceRestores += 1;
      } finally {
        entry.applying = false;
      }
    };
    installPreferredSoundGesture(
      () => (entries.size === 1 ? [...entries.values()][0] : null),
      restorePreferredSound,
      `${MAIN_AUDIO_CONTROL},${MAIN_QUALITY_CONTROL},${AUXILIARY_VIDEO_SELECTOR},${AUXILIARY_UI_SELECTOR},a,[role='link'],[role='slider'],.pzp-setting-pane,.pzp-contextmenu-pane`,
      ".pzp-playback-switch,.pzp-brand-playback-button",
    );
    // Observe the actual media setter in the trusted control's causal window,
    // not a delayed volumechange that could belong to autoplay or advertising.
    for (const property of ["volume", "muted"]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        property,
      );
      if (!descriptor?.set || !descriptor.configurable) continue;
      hookRegistry.define(
        HTMLMediaElement.prototype,
        property,
        {
          ...descriptor,
          set(value) {
            const previous = Reflect.apply(descriptor.get, this, []);
            Reflect.apply(descriptor.set, this, [value]);
            const entry = activeEntry(this);
            if (
              !entry ||
              entry.applying ||
              !entry.intent?.audio ||
              !isPlaybackTaskCurrent(entry.intent.scope) ||
              entry.intent.until < monotonicNow() ||
              previous === Reflect.apply(descriptor.get, this, [])
            )
              return;
            saveOfficialAudioPreference("main", {
              volume: entry.api.volume,
              muted: entry.api.muted,
            });
          },
        },
        `user preference ${property}`,
      );
    }
    addManagedEventListener(
      document,
      "change",
      (event) => {
        const pane = event.target?.closest?.(MAIN_QUALITY_CONTROL);
        const entry = entries.get(pane?.closest(".pzp.pzp-pc"));
        if (
          !entry ||
          entry.applying ||
          !entry.intent?.quality ||
          entry.intent.until < monotonicNow()
        )
          return;
        const tracks = Array.from(entry.api.videoTracks ?? []);
        const track = event.detail?.track;
        if (!tracks.includes(track)) return;
        writePlayerPreference("quality", entry.type, preferenceForTrack(track));
        entry.qualitySignature = tracks
          .map((item) => `${item.id}:${item.label}:${item.kind}`)
          .join("|");
        entry.qualityTracks = tracks;
        entry.intent.quality = false;
      },
      true,
      "user quality preference",
    );
    // Keep the official store aligned with the remembered user intent. Runtime
    // automatic mute is still permitted; only its preference write is replaced.
    const descriptor = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    );
    hookRegistry.define(
      Storage.prototype,
      "setItem",
      {
        ...descriptor,
        value(key, value) {
          const type =
            key === "player-volume" || key === "player-volume-muted"
              ? "main"
              : key === "clip-viewer-volume" ||
                  key === "clip-viewer-volume-muted"
                ? "clip"
                : null;
          const route = preferenceRouteType();
          if (
            type === "main" &&
            !entries.size &&
            (route === "live" || route === "vod")
          ) {
            try {
              scan();
            } catch (error) {
              reportFailure("Preference store binding", error);
            }
          }
          const owned =
            type &&
            (type === "main"
              ? [...entries.values()].some(
                  (entry) =>
                    entry.route === root.location.pathname &&
                    entry.player.matches(".pzp.pzp-pc") &&
                    entry.player.isConnected,
                )
              : [...document.querySelectorAll("iframe")].some(
                  (frame) =>
                    frame.src === managedClipFrames.get(frame)?.url ||
                    frame.src === pendingClipFrames.get(frame)?.url,
                ));
          if (
            this === preferenceStorage &&
            owned &&
            type &&
            (type === "main"
              ? route === "live" || route === "vod"
              : route === "clip")
          ) {
            const audio = seedOfficialAudioPreference(type);
            const preferred = key.endsWith("-muted")
              ? audio?.muted
              : audio?.volume;
            if (preferred !== undefined) {
              const expected = nativeJsonStringify(
                key.endsWith("-muted")
                  ? preferred
                  : type === "clip"
                    ? Math.round(preferred * 100)
                    : { value: preferred },
              );
              if (String(value) !== expected)
                stats.temporaryPreferenceWritesPrevented += 1;
              value = expected;
            }
          }
          return Reflect.apply(nativePreferenceSet, this, [key, value]);
        },
      },
      "official audio preference protection",
    );
    const clipVolumeIntents = new WeakMap();
    addManagedEventListener(
      root,
      "message",
      (event) => {
        if (
          event.origin !== "https://m.naver.com" ||
          preferenceRouteType() !== "clip"
        )
          return;
        const frame = [...document.querySelectorAll("iframe")].find((frame) => {
          if (frame.contentWindow !== event.source) return false;
          try {
            const url = new URL(frame.src);
            return (
              url.origin === event.origin &&
              url.pathname === "/shorts/" &&
              url.searchParams.get("serviceType") === "CHZZK" &&
              url.searchParams.get("embed") === "true"
            );
          } catch {
            return false;
          }
        });
        if (!frame || !isRecord(event.data)) return;
        const binding = managedClipFrames.get(frame);
        const currentBinding =
          binding &&
          binding.confirmed &&
          frame.src === binding.url &&
          isPlaybackTaskCurrent(binding.scope);
        if (
          event.data.messageType === "shorts-viewer.event.volume" &&
          currentBinding &&
          clipVolumeIntents.get(frame)?.binding === binding &&
          clipVolumeIntents.get(frame).until > monotonicNow()
        ) {
          const volume = event.data.payload?.volume;
          if (typeof volume === "number" && volume >= 0 && volume <= 100) {
            const audio = readPlayerPreferences().audio.clip ?? {};
            saveOfficialAudioPreference("clip", {
              volume: volume / 100,
              muted: volume > 0 ? false : (audio.muted ?? false),
            });
          }
          return;
        }
        if (event.data.channel !== CLIP_PREFERENCES_MESSAGE) return;
        if (
          !validClipBridgeId(event.data.documentId) ||
          event.data.frameUrl !== frame.src
        )
          return;
        if (event.data.type === "ack") {
          const candidate = pendingClipFrames.get(frame);
          if (
            candidate &&
            candidate.documentId === event.data.documentId &&
            candidate.url === frame.src &&
            event.data.value?.challenge === candidate.challenge &&
            isPlaybackTaskCurrent(candidate.scope)
          ) {
            candidate.confirmed = true;
            managedClipFrames.set(frame, candidate);
            pendingClipFrames.delete(frame);
          }
          return;
        }
        if (
          event.data.type !== "ready" &&
          (!binding ||
            binding.documentId !== event.data.documentId ||
            frame.src !== binding.url ||
            !isPlaybackTaskCurrent(binding.scope))
        )
          return;
        if (event.data.type !== "ready" && !currentBinding) return;
        if (event.data.type === "volume-intent") {
          clipVolumeIntents.set(frame, {
            until: monotonicNow() + 1200,
            binding,
          });
          return;
        }
        if (event.data.type === "ready") {
          const nextBinding =
            binding &&
            binding.documentId === event.data.documentId &&
            frame.src === binding.url &&
            isPlaybackTaskCurrent(binding.scope)
              ? binding
              : {
                  url: frame.src,
                  documentId: event.data.documentId,
                  challenge: newClipBridgeId(),
                  confirmed: false,
                  scope: capturePlaybackTaskScope(frame),
                };
          // A stale document can still have queued ready messages after reload.
          // Do not replace a confirmed current binding until its new challenge
          // is acknowledged by the document actually receiving configuration.
          pendingClipFrames.set(frame, nextBinding);
          const preferences = readPlayerPreferences();
          frame.contentWindow.postMessage(
            {
              channel: CLIP_PREFERENCES_MESSAGE,
              type: "state",
              documentId: nextBinding.documentId,
              challenge: nextBinding.challenge,
              frameUrl: nextBinding.url,
              audio: seedOfficialAudioPreference("clip"),
              quality: preferences.quality.clip ?? null,
            },
            event.origin,
          );
        } else if (event.data.type === "apply-audio") {
          const audio = readPlayerPreferences().audio.clip;
          const targetId = new URL(frame.src).searchParams.get("sdkTargetId");
          if (!targetId || !audio) return;
          if (validVolume(audio.volume))
            frame.contentWindow.postMessage(
              {
                targetId,
                messageType: "shorts-viewer.action.volume",
                payload: { volume: Math.round(audio.volume * 100) },
              },
              event.origin,
            );
          if (typeof audio.muted === "boolean")
            frame.contentWindow.postMessage(
              {
                targetId,
                messageType: "shorts-viewer.action.mute",
                payload: { muted: audio.muted },
              },
              event.origin,
            );
        } else if (event.data.type === "playing") {
          const targetId = new URL(frame.src).searchParams.get("sdkTargetId");
          if (targetId && ["PLAY", "PAUSE"].includes(event.data.value))
            frame.contentWindow.postMessage(
              {
                targetId,
                messageType: "shorts-viewer.action.playing",
                payload: { action: event.data.value },
              },
              event.origin,
            );
        } else if (event.data.type === "audio") {
          const audio = sanitizeAudioPreference(event.data.value);
          if (
            audio &&
            validVolume(audio.volume) &&
            typeof audio.muted === "boolean"
          )
            saveOfficialAudioPreference("clip", audio);
        } else if (event.data.type === "quality") {
          writePlayerPreference("quality", "clip", event.data.value);
        }
      },
      false,
      "verified clip preferences bridge",
    );
    scheduleScan();
  }
  function installClipPlayerEnhancements() {
    if (
      !IS_CLIP_FRAME ||
      !root.document?.addEventListener ||
      !root.MutationObserver ||
      !root.HTMLMediaElement
    )
      return;
    let preferences = { audio: null, quality: null };
    const documentId = newClipBridgeId();
    const frameUrl = root.location.href;
    let received = false,
      userRevision = 0,
      entry = null,
      queued = false;
    const timers = new Set();
    const send = (type, value) =>
      root.parent.postMessage(
        {
          channel: CLIP_PREFERENCES_MESSAGE,
          type,
          value,
          documentId,
          frameUrl,
        },
        "https://chzzk.naver.com",
      );
    const defer = (callback) => {
      const timer = root.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, 0);
      timers.add(timer);
    };
    const liveCore = (video) => {
      const app = document.getElementById("app");
      if (!app?.contains(video)) return null;
      for (
        let element = video, depth = 0;
        element && depth < 12;
        element = element.parentElement, depth++
      ) {
        let fiber = committedReactFiber(element, app);
        for (
          let depth = 0;
          fiber && depth < 48;
          depth++, fiber = reactDataValue(fiber, "return")
        ) {
          const core = reactDataValue(
            reactDataValue(reactDataValue(fiber, "memoizedProps"), "opts"),
            "corePlayer",
          );
          if (
            !core ||
            !core.videoTracks ||
            typeof core.play !== "function" ||
            typeof core.pause !== "function"
          )
            continue;
          if (
            core.player?.video === video ||
            core.player?._videoElement === video ||
            core.shadowRoot?.contains?.(video)
          )
            return core;
        }
      }
      return null;
    };
    const eligible = () =>
      received &&
      entry &&
      entry.video.isConnected &&
      !isAuxiliaryVideo(entry.video) &&
      liveCore(entry.video) === entry.core;
    const saveAudio = () => {
      if (!eligible()) return;
      const audio = sanitizeAudioPreference({
        volume: entry.core.volume,
        muted: entry.core.muted,
      });
      if (
        !audio ||
        !validVolume(audio.volume) ||
        typeof audio.muted !== "boolean"
      )
        return;
      preferences.audio = audio;
      userRevision++;
      send("audio", audio);
      stats.playerPreferenceSaves += 1;
    };
    const saveAudioChoice = (audio) => {
      preferences.audio = audio;
      userRevision++;
      send("audio", audio);
      stats.playerPreferenceSaves += 1;
    };
    const selectedTrack = () =>
      Array.from(entry?.core.videoTracks ?? []).find((track) => track.selected);
    const qualityPanel = document.createElement("details");
    qualityPanel.setAttribute("data-chzzk-clip-preferences", "");
    qualityPanel.hidden = true;
    qualityPanel.style.cssText =
      "position:fixed;left:12px;top:12px;z-index:300;color:white;background:#18181be6;border-radius:6px;padding:6px;font:12px sans-serif;max-width:180px";
    const summary = document.createElement("summary");
    summary.setAttribute("role", "button");
    summary.textContent = "화질 설정";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "클립 화질");
    select.style.cssText =
      "max-width:160px;color:inherit;background:#27272a;padding:4px;margin-top:6px";
    const help = document.createElement("div");
    help.textContent = `↑↓ 클립 이동 · ←→ 탐색 · Space/K 재생 · M 음소거${document.fullscreenEnabled ? " · F 전체화면" : ""} · =/- 음량`;
    help.style.cssText = "max-width:170px;line-height:1.5;margin-top:6px";
    qualityPanel.append(summary, select, help);
    let optionsSignature = "";
    const positionPanel = () => {
      if (!qualityPanel.isConnected || qualityPanel.hidden) return;
      const controls = [
        ...document.querySelectorAll(
          "button,a,[role='button'],[role='slider']",
        ),
      ]
        .filter((node) => !qualityPanel.contains(node))
        .map((node) => node.getBoundingClientRect())
        .filter(
          (rect) =>
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < root.innerHeight &&
            rect.left < root.innerWidth,
        );
      for (const [horizontal, vertical] of [
        ["left", "top"],
        ["left", "bottom"],
        ["right", "bottom"],
        ["right", "top"],
      ]) {
        for (const key of ["left", "right", "top", "bottom"])
          qualityPanel.style[key] =
            key === horizontal || key === vertical ? "12px" : "auto";
        const rect = qualityPanel.getBoundingClientRect();
        if (
          !controls.some(
            (control) =>
              rect.left < control.right &&
              rect.right > control.left &&
              rect.top < control.bottom &&
              rect.bottom > control.top,
          )
        )
          return;
      }
      qualityPanel.hidden = true;
    };
    const updatePanel = () => {
      if (!eligible()) {
        qualityPanel.hidden = true;
        return;
      }
      const tracks = Array.from(entry.core.videoTracks ?? []);
      const signature = tracks
        .map((track) => `${track.id}:${track.label}:${track.kind}`)
        .join("|");
      if (signature !== optionsSignature) {
        select.replaceChildren();
        tracks.forEach((track, index) => {
          if (!automaticVideoTrack(track) && !videoTrackResolution(track))
            return;
          const option = document.createElement("option");
          option.value = String(index);
          option.textContent = automaticVideoTrack(track)
            ? "자동"
            : `${videoTrackResolution(track)}p`;
          select.append(option);
        });
        optionsSignature = signature;
      }
      const index = tracks.indexOf(selectedTrack());
      if (index >= 0) select.value = String(index);
      qualityPanel.hidden = !select.options.length;
      if (!qualityPanel.isConnected && document.body)
        document.body.append(qualityPanel);
      positionPanel();
    };
    const restore = () => {
      if (!eligible() || !received) return;
      if (!entry.audioRestored) {
        entry.audioRestored = true;
        if (
          preferences.audio &&
          !(
            preferences.audio.muted === false &&
            entry.core.muted &&
            !root.navigator?.userActivation?.isActive
          )
        ) {
          send("apply-audio");
          stats.playerPreferenceRestores += 1;
        }
      }
      const tracks = Array.from(entry.core.videoTracks ?? []);
      const signature = tracks
        .map((track) => `${track.id}:${track.label}:${track.kind}`)
        .join("|");
      if (
        !entry.video.paused &&
        entry.video.playbackRate !== 0 &&
        tracks.length &&
        (entry.qualitySignature !== signature ||
          entry.qualityTracks?.length !== tracks.length ||
          !entry.qualityTracks.every((track, index) => track === tracks[index]))
      ) {
        entry.qualitySignature = signature;
        entry.qualityTracks = tracks;
        const track = preferredVideoTrack(tracks, preferences.quality);
        if (track && !track.selected) {
          entry.applying = true;
          try {
            track.selected = true;
            stats.playerPreferenceRestores += 1;
          } finally {
            entry.applying = false;
          }
        }
      }
      updatePanel();
    };
    const scan = () => {
      const videos = [
        ...document.querySelectorAll("video.webplayer-internal-video"),
      ].filter((video) => !isAuxiliaryVideo(video));
      if (videos.length !== 1) {
        entry = null;
        qualityPanel.hidden = true;
        return;
      }
      const video = videos[0],
        core = liveCore(video);
      if (!core) {
        entry = null;
        qualityPanel.hidden = true;
        return;
      }
      if (entry?.video !== video || entry?.core !== core)
        entry = {
          video,
          core,
          audioRestored: false,
          qualitySignature: "",
          applying: false,
          audioIntent: false,
        };
      restore();
    };
    const scheduleScan = () => {
      if (!queued) {
        queued = true;
        defer(() => {
          queued = false;
          scan();
        });
      }
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node.nodeType === 1 &&
              (node.matches?.("video") || node.querySelector?.("video")),
          ),
        )
      )
        scheduleScan();
    });
    observer.observe(document, { childList: true, subtree: true });
    addManagedEventListener(
      qualityPanel,
      "toggle",
      positionPanel,
      false,
      "clip settings placement",
    );
    addManagedEventListener(
      root,
      "resize",
      scheduleScan,
      false,
      "clip settings resize",
    );
    hookRegistry.addCleanup("clip player lifecycle", () => {
      observer.disconnect();
      for (const timer of timers) root.clearTimeout(timer);
      timers.clear();
      qualityPanel.remove();
      entry = null;
    });
    addManagedEventListener(
      root,
      "message",
      (event) => {
        if (
          event.source !== root.parent ||
          event.origin !== "https://chzzk.naver.com" ||
          !isRecord(event.data) ||
          event.data.channel !== CLIP_PREFERENCES_MESSAGE ||
          event.data.documentId !== documentId
        )
          return;
        if (event.data.type === "request-ready") {
          send("ready");
          return;
        }
        if (
          event.data.type !== "state" ||
          event.data.frameUrl !== frameUrl ||
          !validClipBridgeId(event.data.challenge)
        )
          return;
        if (!received || !userRevision)
          preferences = {
            audio: sanitizeAudioPreference(event.data.audio),
            quality: sanitizeQualityPreference(event.data.quality),
          };
        received = true;
        send("ack", { challenge: event.data.challenge });
        scheduleScan();
      },
      false,
      "clip preference state",
    );
    for (const type of ["loadedmetadata", "canplay", "playing"])
      addManagedEventListener(
        document,
        type,
        () => {
          send("ready");
          scheduleScan();
        },
        true,
        `clip ${type}`,
      );
    addManagedEventListener(
      document,
      "DOMContentLoaded",
      () => {
        send("ready");
        scheduleScan();
      },
      true,
      "clip ready",
    );
    addManagedEventListener(
      select,
      "change",
      (event) => {
        if (!event.isTrusted || !eligible()) return;
        const track = Array.from(entry.core.videoTracks ?? [])[
          Number(select.value)
        ];
        const quality = preferenceForTrack(track);
        if (!quality) return;
        preferences.quality = quality;
        userRevision++;
        send("quality", quality);
        entry.applying = true;
        try {
          track.selected = true;
          stats.playerPreferenceSaves += 1;
        } finally {
          entry.applying = false;
        }
        entry.qualitySignature = Array.from(entry.core.videoTracks ?? [])
          .map((item) => `${item.id}:${item.label}:${item.kind}`)
          .join("|");
        entry.qualityTracks = Array.from(entry.core.videoTracks ?? []);
      },
      false,
      "clip quality selection",
    );
    const nativeAudioControl =
      "[class*='VolumeButtonView-module__btn_sound__'],[class*='VolumeButtonView-module__slider__'],[class*='VolumeButtonView-module__control_wrap__'],[class*='VolumeButtonView-module__volumebar__']";
    const muteChoice = (button) => {
      const pressed = button?.getAttribute("aria-pressed");
      return {
        volume: entry.core.volume,
        muted:
          pressed === "true"
            ? false
            : pressed === "false"
              ? true
              : !entry.core.muted,
      };
    };
    const captureAudio = (event) => {
      if (
        !event.isTrusted ||
        !eligible() ||
        !(event.target instanceof Element) ||
        (event.type === "pointermove" && event.buttons === 0) ||
        !event.target.closest(nativeAudioControl)
      )
        return;
      const current = entry;
      if (
        event.type === "click" &&
        event.target.closest(
          "button[class*='VolumeButtonView-module__btn_sound__']",
        )
      ) {
        saveAudioChoice(
          muteChoice(
            event.target.closest(
              "button[class*='VolumeButtonView-module__btn_sound__']",
            ),
          ),
        );
      } else if (
        event.target.closest(
          "[class*='VolumeButtonView-module__slider__'],[class*='VolumeButtonView-module__control_wrap__'],[class*='VolumeButtonView-module__volumebar__']",
        )
      ) {
        send("volume-intent");
      }
      const intent = { scope: capturePlaybackTaskScope(current.video) };
      current.audioIntent = intent;
      defer(() => {
        if (entry === current && current.audioIntent === intent)
          current.audioIntent = false;
      });
    };
    for (const type of [
      "click",
      "pointerdown",
      "pointermove",
      "pointerup",
      "input",
      "keydown",
    ])
      addManagedEventListener(
        document,
        type,
        captureAudio,
        true,
        `clip audio ${type}`,
      );
    for (const property of ["volume", "muted"]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        property,
      );
      if (!descriptor?.set || !descriptor.configurable) continue;
      hookRegistry.define(
        HTMLMediaElement.prototype,
        property,
        {
          ...descriptor,
          set(value) {
            const before = Reflect.apply(descriptor.get, this, []);
            Reflect.apply(descriptor.set, this, [value]);
            if (
              entry?.video === this &&
              !entry.applying &&
              entry.audioIntent &&
              isPlaybackTaskCurrent(entry.audioIntent.scope) &&
              before !== Reflect.apply(descriptor.get, this, [])
            )
              saveAudio();
          },
        },
        `clip user ${property}`,
      );
    }
    const visibleButton = (selector) =>
      [...document.querySelectorAll(selector)].find((button) => {
        const rect = button.getBoundingClientRect();
        return (
          !button.disabled &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < root.innerHeight
        );
      });
    const pendingKeys = new WeakMap();
    const keyEligible = (event) =>
      event.isTrusted &&
      document.hasFocus() &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !preferenceEditable(event.target) &&
      !event.target.closest(
        "button,a,[role='button'],[role='link'],[role='slider']",
      ) &&
      eligible();
    addManagedEventListener(
      document,
      "keydown",
      (event) => {
        if (!keyEligible(event)) return;
        const key = event.key.toLowerCase();
        if (!["k", "ㅏ", "m", "ㅡ", "f", "ㄹ", "=", "-"].includes(key)) return;
        if (key === "m" || key === "ㅡ") {
          const current = entry;
          const intent = { scope: capturePlaybackTaskScope(current.video) };
          current.audioIntent = intent;
          defer(() => {
            if (entry === current && current.audioIntent === intent)
              current.audioIntent = false;
          });
        }
        pendingKeys.set(event, {
          entry,
          volume: entry.core.volume,
          muted: entry.core.muted,
          paused: entry.core.paused,
          fullscreen: document.fullscreenElement,
          scope: capturePlaybackTaskScope(entry.video),
          mutePressed: visibleButton(
            "button[class*='VolumeButtonView-module__btn_sound__']",
          )?.getAttribute("aria-pressed"),
        });
      },
      true,
      "clip keyboard capture",
    );
    addManagedEventListener(
      document,
      "keydown",
      (event) => {
        const before = pendingKeys.get(event);
        pendingKeys.delete(event);
        const key = event.key.toLowerCase();
        if (
          before &&
          isPlaybackTaskCurrent(before.scope) &&
          keyEligible(event) &&
          entry === before.entry &&
          ["m", "ㅡ"].includes(key)
        ) {
          const pressed = visibleButton(
            "button[class*='VolumeButtonView-module__btn_sound__']",
          )?.getAttribute("aria-pressed");
          if (
            pressed !== before.mutePressed &&
            ["true", "false"].includes(pressed)
          ) {
            saveAudioChoice({
              volume: entry.core.volume,
              muted: pressed === "true",
            });
            return;
          }
        }
        if (
          !before ||
          !isPlaybackTaskCurrent(before?.scope) ||
          !keyEligible(event) ||
          event.defaultPrevented ||
          entry !== before.entry ||
          entry.core.volume !== before.volume ||
          entry.core.muted !== before.muted ||
          entry.core.paused !== before.paused ||
          document.fullscreenElement !== before.fullscreen
        )
          return;
        let handled = false;
        if (key === "m" || key === "ㅡ") {
          const button = visibleButton(
            "button[class*='VolumeButtonView-module__btn_sound__']",
          );
          if (button) {
            entry.audioIntent = {
              scope: capturePlaybackTaskScope(entry.video),
            };
            const audio = muteChoice(button);
            button.click();
            saveAudioChoice(audio);
            entry.audioIntent = false;
            handled = true;
          }
        } else if (key === "k" || key === "ㅏ") {
          if (preferences.audio?.muted === false && entry.core.muted)
            send("apply-audio");
          send("playing", entry.core.paused ? "PLAY" : "PAUSE");
          handled = true;
        } else if (key === "=" || key === "-") {
          entry.audioIntent = { scope: capturePlaybackTaskScope(entry.video) };
          entry.core.volume = Math.max(
            0,
            Math.min(
              1,
              Math.round(
                (entry.core.volume + (key === "=" ? 0.05 : -0.05)) * 100,
              ) / 100,
            ),
          );
          saveAudio();
          send("apply-audio");
          entry.audioIntent = false;
          handled = true;
        } else if (key === "f" || key === "ㄹ") {
          const action =
            document.fullscreenEnabled === false
              ? null
              : document.fullscreenElement
                ? document.exitFullscreen?.bind(document)
                : entry.core.requestFullscreen?.bind(entry.core);
          if (action) {
            try {
              action()?.catch?.(() => {});
              handled = true;
            } catch {}
          }
        }
        if (handled) {
          event.preventDefault();
          stats.clipKeyboardRepairs += 1;
        }
      },
      false,
      "clip keyboard fallback",
    );
    send("ready");
    const restoreSound = (owner) => {
      if (
        !eligible() ||
        entry !== owner ||
        preferences.audio?.muted !== false ||
        !validVolume(preferences.audio.volume) ||
        preferences.audio.volume === 0 ||
        !entry.core.muted
      )
        return;
      // Apply within the frame's genuine activation, then align parent SDK UI.
      entry.applying = true;
      try {
        entry.core.muted = false;
        send("apply-audio");
        stats.playerPreferenceRestores += 1;
      } finally {
        entry.applying = false;
      }
    };
    installPreferredSoundGesture(
      () => (eligible() ? entry : null),
      restoreSound,
      `${nativeAudioControl},${AUXILIARY_VIDEO_SELECTOR},${AUXILIARY_UI_SELECTOR},[data-chzzk-clip-preferences],a,[role='link'],[role='slider']`,
      "[class*='ControlAreaView-module__btn_play__']",
    );
    scheduleScan();
  }
  function installAdPlaybackMock() {
    if (!root.document || !root.HTMLVideoElement) {
      return;
    }

    installEarlyStyle();
    installPopupDismissObserver();
    installLowLatencyEngine();
    installChatLatencyDisplayEngine();
    const lastSource = new WeakMap();
    const advancedSource = new WeakMap();
    const advanceBindings = new WeakMap();
    const advanceStates = new WeakMap();
    const advanceDiagnosticTimers = new Set();
    const videosAwaitingAdvanceBinding = new WeakSet();
    const midrollCountdownStates = new WeakMap();
    const midrollCountdownObservers = new WeakMap();
    const activeMidrollCountdownObservers = new Set();
    hookRegistry.addCleanup("ad advance diagnostics", () => {
      for (const timer of advanceDiagnosticTimers) {
        root.clearTimeout(timer);
      }
      advanceDiagnosticTimers.clear();
    });
    hookRegistry.addCleanup("mid-roll countdown observers", () => {
      for (const observer of activeMidrollCountdownObservers) {
        observer.disconnect();
      }
      activeMidrollCountdownObservers.clear();
    });

    const advanceMidrollCountdown = (element) => {
      let state = midrollCountdownStates.get(element);
      if (!state) {
        state = { active: false };
        midrollCountdownStates.set(element, state);
      }
      if (!element.classList.contains(MIDROLL_COUNTDOWN_STARTED_CLASS)) {
        state.active = false;
        return;
      }
      if (state.active) {
        return;
      }

      state.active = true;
      stats.midrollCountdownsDetected += 1;
      const detectedAt = monotonicNow();
      const scope = capturePlaybackTaskScope(element);
      enqueueMicrotask(() => {
        if (
          !isPlaybackTaskCurrent(scope) ||
          midrollCountdownStates.get(element) !== state ||
          !element.isConnected ||
          !element.classList.contains(MIDROLL_COUNTDOWN_STARTED_CLASS)
        ) {
          state.active = false;
          return;
        }
        try {
          const animationName = root
            .getComputedStyle(element)
            .animationName.split(",", 1)[0]
            .trim();
          const event =
            typeof root.AnimationEvent === "function"
              ? new root.AnimationEvent("animationend", {
                  animationName,
                  bubbles: true,
                  elapsedTime: 10,
                })
              : new root.Event("animationend", { bubbles: true });
          element.dispatchEvent(event);
          stats.midrollCountdownsAdvanced += 1;
          stats.maxMidrollCountdownLatencyMs = Math.max(
            stats.maxMidrollCountdownLatencyMs,
            monotonicNow() - detectedAt,
          );
        } catch (error) {
          state.active = false;
          reportFailure("VOD mid-roll countdown transition", error);
          return;
        }

        const timer = root.setTimeout(() => {
          advanceDiagnosticTimers.delete(timer);
          if (
            !isPlaybackTaskCurrent(scope) ||
            midrollCountdownStates.get(element) !== state
          )
            return;
          if (
            element.isConnected &&
            element.classList.contains(MIDROLL_COUNTDOWN_STARTED_CLASS)
          ) {
            reportFailure(
              "VOD mid-roll countdown transition",
              new Error(
                "The player's animationend handler did not clear the countdown state.",
              ),
            );
          } else {
            state.active = false;
          }
        }, 100);
        advanceDiagnosticTimers.add(timer);
      });
    };

    const observeMidrollCountdown = (element) => {
      if (
        !(element instanceof Element) ||
        !element.classList.contains(MIDROLL_COUNTDOWN_CLASS) ||
        midrollCountdownObservers.has(element)
      ) {
        return;
      }
      const observer = new MutationObserver(() =>
        advanceMidrollCountdown(element),
      );
      observer.observe(element, {
        attributeFilter: ["class"],
        attributes: true,
      });
      midrollCountdownObservers.set(element, observer);
      activeMidrollCountdownObservers.add(observer);
      advanceMidrollCountdown(element);
    };

    const visitMidrollCountdowns = (node, callback) => {
      if (!(node instanceof Element)) {
        return;
      }
      if (node.classList.contains(MIDROLL_COUNTDOWN_CLASS)) {
        callback(node);
      }
      if (!node.firstElementChild) {
        return;
      }
      for (const element of node.querySelectorAll(MIDROLL_COUNTDOWN_SELECTOR)) {
        callback(element);
      }
    };

    const stopObservingMidrollCountdown = (element) => {
      const observer = midrollCountdownObservers.get(element);
      if (!observer) {
        return;
      }
      observer.disconnect();
      activeMidrollCountdownObservers.delete(observer);
      midrollCountdownObservers.delete(element);
      midrollCountdownStates.delete(element);
    };
    const playMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "play",
    );
    if (!playMethod || typeof playMethod.descriptor.value !== "function") {
      throw new Error("Failed to install the HTMLMediaElement.play hook.");
    }
    const nativeMediaPlay = playMethod.descriptor.value;
    const currentTimeMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "currentTime",
    );
    const playbackRateMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "playbackRate",
    );
    const defaultPlaybackRateMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "defaultPlaybackRate",
    );
    if (
      !currentTimeMethod ||
      typeof currentTimeMethod.descriptor.get !== "function" ||
      typeof currentTimeMethod.descriptor.set !== "function" ||
      !playbackRateMethod ||
      typeof playbackRateMethod.descriptor.get !== "function" ||
      typeof playbackRateMethod.descriptor.set !== "function" ||
      !defaultPlaybackRateMethod ||
      typeof defaultPlaybackRateMethod.descriptor.set !== "function"
    ) {
      throw new Error(
        "Failed to obtain the native ad media time and playback-rate setters.",
      );
    }
    const nativeCurrentTimeGetter = currentTimeMethod.descriptor.get;
    const nativeCurrentTimeSetter = currentTimeMethod.descriptor.set;
    const nativePlaybackRateGetter = playbackRateMethod.descriptor.get;
    const nativePlaybackRateSetter = playbackRateMethod.descriptor.set;
    const nativeDefaultPlaybackRateSetter =
      defaultPlaybackRateMethod.descriptor.set;

    const finishPlayerState = (video, source, reason) => {
      if (!CLEAN_SETTINGS.autoAdSkip) {
        return;
      }
      const container = video.closest(AUXILIARY_VIDEO_SELECTOR);
      const containerIsActive =
        container instanceof HTMLElement && container.style.display === "block";
      if (
        !containerIsActive &&
        reason !== "play-call" &&
        reason !== "play" &&
        reason !== "playing" &&
        reason !== "ended" &&
        reason !== "timeupdate"
      ) {
        return;
      }

      let binding = advanceBindings.get(video);
      const currentNavigation = refreshPlaybackNavigation();
      const shouldBindCurrentGeneration =
        !binding ||
        reason === "play-call" ||
        (containerIsActive && reason === "container:style");
      if (
        shouldBindCurrentGeneration &&
        Array.isArray(playbackAdvanceListeners) &&
        (binding?.generation !== playbackAdvanceGeneration ||
          binding?.navigation !== currentNavigation)
      ) {
        binding = {
          generation: playbackAdvanceGeneration,
          listeners: playbackAdvanceListeners,
          navigation: currentNavigation,
        };
        advanceBindings.set(video, binding);
        stats.adAdvanceBindings += 1;
      }
      if (!binding || binding.navigation !== currentNavigation) {
        if (containerIsActive && !videosAwaitingAdvanceBinding.has(video)) {
          videosAwaitingAdvanceBinding.add(video);
          const scope = capturePlaybackTaskScope(video);
          const timer = root.setTimeout(() => {
            advanceDiagnosticTimers.delete(timer);
            videosAwaitingAdvanceBinding.delete(video);
            if (
              isPlaybackTaskCurrent(scope) &&
              video.isConnected &&
              !advanceBindings.has(video) &&
              video.closest(AUXILIARY_VIDEO_SELECTOR)?.style?.display ===
                "block"
            ) {
              reportIssue(
                "Ad completion contract",
                "An active auxiliary player has no compatible completion listener.",
                "missing-ad-completion-listener",
              );
            }
          }, 1_000);
          advanceDiagnosticTimers.add(timer);
        }
        return;
      }

      const listeners = binding.listeners.filter(
        (listener) => typeof listener === "function",
      );
      if (!listeners.length) {
        return;
      }

      let advanceState = advanceStates.get(video);
      const navigation = refreshPlaybackNavigation();
      if (
        !advanceState ||
        advanceState.source !== source ||
        advanceState.navigation !== navigation ||
        advanceState.generation !== binding.generation
      ) {
        advanceState = {
          attempted: false,
          generation: binding.generation,
          source,
          navigation,
        };
        advanceStates.set(video, advanceState);
      }
      if (advanceState.attempted) {
        return;
      }
      // The listener is the player's own skip transition. Invoke it once only
      // after REQUESTED_TO_START made the container active, or after native
      // playback started. Empty-source discovery must not consume this chance.
      advanceState.attempted = true;

      const previousSource = advancedSource.get(video);
      if (
        previousSource === undefined ||
        (source !== previousSource && !(previousSource === "" && source))
      ) {
        stats.advancedAds += 1;
      }
      if (previousSource !== source) {
        advancedSource.set(video, source);
      }
      const scheduledAt = monotonicNow();
      const scope = capturePlaybackTaskScope(video);
      enqueueMicrotask(() => {
        if (!CLEAN_SETTINGS.autoAdSkip) return;
        if (
          !isPlaybackTaskCurrent(scope) ||
          advanceBindings.get(video) !== binding ||
          advanceStates.get(video) !== advanceState ||
          !isAuxiliaryVideo(video, true)
        )
          return;
        stats.adAdvanceAttempts += 1;
        stats.maxAdCompletionLatencyMs = Math.max(
          stats.maxAdCompletionLatencyMs,
          monotonicNow() - scheduledAt,
        );
        for (const listener of listeners) {
          if (
            !isPlaybackTaskCurrent(scope) ||
            advanceBindings.get(video) !== binding
          )
            break;
          if (!binding.listeners.includes(listener)) continue;
          try {
            listener();
          } catch (error) {
            reportFailure("Ad completion listener", error);
          }
        }
        lifecycleCallbacks.reconcilePrimaryPlayback("ad-complete");
      });
    };

    const prepare = (video, reason) => {
      const structuralChange =
        reason === "play-call" ||
        reason === "loadstart" ||
        reason === "node-added" ||
        reason === "subtree-added" ||
        reason === "container-added" ||
        reason === "listener-registration" ||
        reason.startsWith("attribute:") ||
        reason.startsWith("container:");
      if (!isAuxiliaryVideo(video, structuralChange)) {
        video.classList.remove(AUXILIARY_VIDEO_CLASS);
        return false;
      }

      video.classList.add(AUXILIARY_VIDEO_CLASS);
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;

      const source = video.currentSrc || video.src || "";
      const previousSource = lastSource.get(video);
      if (
        previousSource === undefined ||
        (source !== previousSource && !(previousSource === "" && source))
      ) {
        stats.mockedAds += 1;
      }
      if (previousSource !== source) {
        lastSource.set(video, source);
      }

      try {
        finishPlayerState(video, source, reason);
        Reflect.apply(nativeDefaultPlaybackRateSetter, video, [16]);
        if (Reflect.apply(nativePlaybackRateGetter, video, []) !== 16) {
          Reflect.apply(nativePlaybackRateSetter, video, [16]);
          stats.nativeAdRateChanges += 1;
        }

        const currentTime = Reflect.apply(nativeCurrentTimeGetter, video, []);
        if (
          Number.isFinite(video.duration) &&
          video.duration > 0.1 &&
          video.duration <= 300 &&
          currentTime < video.duration - 0.1
        ) {
          Reflect.apply(nativeCurrentTimeSetter, video, [
            Math.max(0, video.duration - 0.05),
          ]);
          stats.nativeAdSeeks += 1;
        }
      } catch (error) {
        reportFailure("Ad media processing", error);
      }
      return true;
    };

    const advance = (video, reason) => {
      const container = video.closest(AUXILIARY_VIDEO_SELECTOR);
      const active =
        container instanceof HTMLElement && container.style.display === "block";
      if (
        prepare(video, reason) &&
        active &&
        video.paused &&
        video.readyState >= 2
      ) {
        Reflect.apply(nativeMediaPlay, video, []).catch((error) => {
          reportFailure("Ad media playback", error);
        });
      }
    };

    function play(...args) {
      if (this instanceof HTMLVideoElement) {
        prepare(this, "play-call");
      }
      return Reflect.apply(nativeMediaPlay, this, args);
    }
    hookRegistry.define(
      playMethod.owner,
      "play",
      { ...playMethod.descriptor, value: play },
      "HTMLMediaElement.prototype.play",
    );

    for (const [property, forcedValue] of [
      ["muted", true],
      ["defaultMuted", true],
      ["volume", 0],
    ]) {
      const method = findMethodDescriptor(
        root.HTMLMediaElement.prototype,
        property,
      );
      if (!method || typeof method.descriptor.set !== "function") {
        throw new Error(
          `Failed to install the HTMLMediaElement.${property} hook.`,
        );
      }
      const nativeSetter = method.descriptor.set;
      hookRegistry.define(
        method.owner,
        property,
        {
          ...method.descriptor,
          set(value) {
            if (
              this instanceof HTMLVideoElement &&
              isAuxiliaryVideo(this) &&
              value !== forcedValue
            ) {
              stats.blockedAdAudio += 1;
              return Reflect.apply(nativeSetter, this, [forcedValue]);
            }
            return Reflect.apply(nativeSetter, this, [value]);
          },
        },
        `HTMLMediaElement.prototype.${property}`,
      );
    }

    const onMediaEvent = (event) => {
      if (
        event.target instanceof HTMLVideoElement &&
        isAuxiliaryVideo(event.target, event.type === "volumechange")
      ) {
        advance(event.target, event.type);
        // The native ad adapter forwards volumechange into AdVolumeChange,
        // which writes the ad's forced mute/volume into the primary store.
        // Contain only our silenced ad event; primary/user events stay native.
        if (
          event.type === "volumechange" &&
          event.target.muted &&
          event.target.volume === 0
        ) {
          event.stopImmediatePropagation();
          stats.blockedAdVolumeEvents += 1;
        }
      }
    };
    subscribeMediaEvents(
      [
        "loadstart",
        "loadedmetadata",
        "durationchange",
        "loadeddata",
        "canplay",
        "play",
        "playing",
        "ended",
        "seeked",
        "timeupdate",
        "volumechange",
      ],
      onMediaEvent,
      "ad playback",
    );

    lifecycleCallbacks.reconcileAuxiliaryVideos = (reason = "reconcile") => {
      for (const video of document.querySelectorAll("video")) {
        if (isAuxiliaryVideo(video)) {
          advance(video, reason);
        }
      }
    };

    const observer = new MutationObserver((records) => {
      let shouldReconcilePrimary = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target;
          if (
            target instanceof Element &&
            (target.matches(DISPLAY_AD_SLOT_SELECTOR) ||
              target.hasAttribute(DISPLAY_AD_MARKER))
          )
            reconcileDisplayAdSlot(target);
          switch (record.attributeName) {
            case "src":
              auxiliaryDomRevision += 1;
              if (target instanceof HTMLVideoElement) {
                advance(target, "attribute:src");
              }
              break;
            case "data-role":
            case "id":
              auxiliaryDomRevision += 1;
              if (target instanceof HTMLVideoElement) {
                advance(target, `attribute:${record.attributeName}`);
              } else if (target instanceof Element) {
                for (const video of target.querySelectorAll("video")) {
                  advance(video, `container:${record.attributeName}`);
                }
              }
              break;
            case "style":
              if (
                !(target instanceof Element) ||
                !target.matches(AUXILIARY_VIDEO_SELECTOR)
              ) {
                break;
              }
              for (const video of target.querySelectorAll("video")) {
                advance(video, "container:style");
              }
              shouldReconcilePrimary = true;
              break;
          }
          continue;
        }
        const displaySlot =
          record.target instanceof Element &&
          record.target.closest(DISPLAY_AD_SLOT_SELECTOR);
        if (displaySlot) reconcileDisplayAdSlot(displaySlot);
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          visitMidrollCountdowns(node, stopObservingMidrollCountdown);
          const removedContainer =
            node.matches(AUXILIARY_VIDEO_SELECTOR) ||
            Boolean(node.querySelector(AUXILIARY_VIDEO_SELECTOR));
          if (
            node instanceof HTMLVideoElement ||
            removedContainer ||
            node.querySelector("video")
          ) {
            auxiliaryDomRevision += 1;
          }
          shouldReconcilePrimary ||= removedContainer;
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          visitDisplayAdSlots(node);
          visitMidrollCountdowns(node, observeMidrollCountdown);
          const nodeIsContainer = node.matches(AUXILIARY_VIDEO_SELECTOR);
          const nestedVideos = node.querySelectorAll("video");
          if (
            node instanceof HTMLVideoElement ||
            nodeIsContainer ||
            nestedVideos.length > 0
          ) {
            auxiliaryDomRevision += 1;
          }
          if (node instanceof HTMLVideoElement) {
            advance(node, "node-added");
          }
          for (const video of nestedVideos) {
            advance(
              video,
              nodeIsContainer ? "container-added" : "subtree-added",
            );
          }
        }
      }
      if (shouldReconcilePrimary) {
        lifecycleCallbacks.reconcilePrimaryPlayback("auxiliary-mutation");
      }
    });
    observer.observe(document, {
      attributeFilter: ["src", "style", "data-role", "id"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    hookRegistry.addCleanup("auxiliary video observer", () =>
      observer.disconnect(),
    );
    for (const element of document.querySelectorAll(
      MIDROLL_COUNTDOWN_SELECTOR,
    )) {
      observeMidrollCountdown(element);
    }
    lifecycleCallbacks.reconcileAuxiliaryVideos("initial");
    if (document.documentElement) visitDisplayAdSlots(document.documentElement);
  }
  function installStartupPlaybackSafetyNet() {
    if (!root.document || !root.HTMLVideoElement) {
      return;
    }

    const MAX_STARTUP_AGE_MS = 15_000;
    // The current player intentionally pauses and replays during a rate-zero
    // warm-up. The narrow hook below handles it; the general safety net keeps
    // its existing response time for unrelated startup stalls.
    const MIN_READY_STALL_MS = 750;
    const MAX_STARTUP_ATTEMPTS = 1;
    const videoStates = new WeakMap();
    const warmupResumePending = new WeakMap();
    const pendingTimers = new Set();
    const cancelTimers = () => {
      for (const timer of pendingTimers) root.clearTimeout(timer);
      pendingTimers.clear();
    };
    subscribePlaybackNavigation(
      cancelTimers,
      "startup navigation cancellation",
    );

    hookRegistry.addCleanup("startup safety-net timers", () => {
      cancelTimers();
    });

    const hasActiveAuxiliaryPlayback = (primary) => {
      const scope = primary.closest(PLAYER_SCOPE_SELECTOR) ?? document;
      for (const container of scope.querySelectorAll(
        AUXILIARY_VIDEO_SELECTOR,
      )) {
        if (
          container instanceof HTMLElement &&
          container.style.display === "block"
        ) {
          return true;
        }
        const videos =
          container instanceof HTMLVideoElement
            ? [container]
            : container.querySelectorAll("video");
        for (const video of videos) {
          if (!video.paused && !video.ended) {
            return true;
          }
        }
      }
      return false;
    };

    const stateFor = (video) => {
      const route = currentPlaybackRoute();
      const source = video.currentSrc || video.src || "";
      const mediaVersion = playbackMediaVersions.get(video) ?? 0;
      const declaredSource = video.getAttribute("src");
      const sourceObject = video.srcObject;
      let state = videoStates.get(video);
      const navigation = refreshPlaybackNavigation();
      if (!state || state.route !== route || state.navigation !== navigation) {
        state = {
          attempts: 0,
          firstSeenAt: monotonicNow(),
          hasProgressed: false,
          pending: false,
          timer: null,
          readySince: -Infinity,
          safetyNetPending: false,
          route,
          navigation,
          source,
          mediaVersion,
          declaredSource,
          sourceObject,
          userPaused: false,
        };
        videoStates.set(video, state);
      } else if (
        state.source !== source ||
        state.mediaVersion !== mediaVersion ||
        state.declaredSource !== declaredSource ||
        state.sourceObject !== sourceObject
      ) {
        // A quality/CDN source swap is still the same route startup. Do not
        // replenish its play budget or forget an already observed start.
        state.source = source;
        state.mediaVersion = mediaVersion;
        state.declaredSource = declaredSource;
        state.sourceObject = sourceObject;
        if (state.timer !== null) {
          root.clearTimeout(state.timer);
          pendingTimers.delete(state.timer);
          state.timer = null;
          state.pending = false;
        }
        state.readySince = -Infinity;
        state.safetyNetPending = false;
      }
      return state;
    };

    const hasPlayableBuffer = (video) => {
      const currentTime = video.currentTime;
      for (let index = 0; index < video.buffered.length; index += 1) {
        if (
          video.buffered.start(index) <= currentTime + 0.25 &&
          video.buffered.end(index) > currentTime + 0.1
        ) {
          return true;
        }
      }
      return false;
    };

    const updateReadyWindow = (video, state) => {
      if (video.readyState >= 2 && hasPlayableBuffer(video)) {
        if (!Number.isFinite(state.readySince)) {
          state.readySince = monotonicNow();
        }
        return;
      }
      state.readySince = -Infinity;
    };

    const scheduleSafetyNet = (video, reason, delay = MIN_READY_STALL_MS) => {
      const state = stateFor(video);
      if (
        state.pending ||
        state.hasProgressed ||
        state.userPaused ||
        hasUserMediaIntent(video, "pause")
      ) {
        return;
      }
      state.pending = true;
      const scope = capturePlaybackTaskScope(video);
      const timer = root.setTimeout(() => {
        pendingTimers.delete(timer);
        if (state.timer !== timer) return;
        state.timer = null;
        state.pending = false;
        if (!isPlaybackTaskCurrent(scope) || videoStates.get(video) !== state)
          return;
        attemptSafetyNet(video, reason);
      }, delay);
      pendingTimers.add(timer);
      state.timer = timer;
    };

    // The official SourcePlayer warm-up deliberately plays at rate 0, pauses,
    // restores the rate, and plays again. The promise continuation can be
    // delayed enough to expose a visible stop. Preserve its real pause/event
    // contract, then resume in a microtask after the synchronous rate restore.
    const pauseMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "pause",
    );
    const playMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "play",
    );
    const playbackRateMethod = findMethodDescriptor(
      root.HTMLMediaElement.prototype,
      "playbackRate",
    );
    if (
      !pauseMethod ||
      typeof pauseMethod.descriptor.value !== "function" ||
      !playMethod ||
      typeof playMethod.descriptor.value !== "function" ||
      !playbackRateMethod ||
      typeof playbackRateMethod.descriptor.get !== "function"
    ) {
      throw new Error("Failed to obtain native startup warm-up methods.");
    }
    const managedMediaPlay = playMethod.descriptor.value;
    const nativeMediaPause = pauseMethod.descriptor.value;
    const nativePlaybackRateGetter = playbackRateMethod.descriptor.get;
    function pause(...args) {
      let smoothOfficialWarmup = false;
      let scope = null;
      let warmupState = null;
      if (this instanceof HTMLVideoElement) {
        const state = stateFor(this);
        warmupState = state;
        smoothOfficialWarmup = Boolean(
          state.route &&
          !state.userPaused &&
          !this.paused &&
          this.readyState >= 2 &&
          findPrimaryPlaybackVideo(this) === this &&
          !isAuxiliaryVideo(this) &&
          !hasActiveUserMediaIntent(this, "pause") &&
          !hasUserMediaIntent(this, "pause") &&
          Reflect.apply(nativePlaybackRateGetter, this, []) === 0,
        );
        if (smoothOfficialWarmup) scope = capturePlaybackTaskScope(this);
      }
      const result = Reflect.apply(nativeMediaPause, this, args);
      const pendingWarmup = warmupResumePending.get(this);
      if (
        smoothOfficialWarmup &&
        scope &&
        (!pendingWarmup || !isPlaybackTaskCurrent(pendingWarmup))
      ) {
        const video = this;
        warmupResumePending.set(video, scope);
        enqueueMicrotask(() => {
          if (warmupResumePending.get(video) !== scope) return;
          warmupResumePending.delete(video);
          if (
            !isPlaybackTaskCurrent(scope) ||
            videoStates.get(video) !== warmupState
          )
            return;
          const state = warmupState;
          if (
            !video.isConnected ||
            !video.paused ||
            video.ended ||
            video.seeking ||
            state.userPaused ||
            hasUserMediaIntent(video, "pause") ||
            findPrimaryPlaybackVideo(video) !== video ||
            isAuxiliaryVideo(video) ||
            Reflect.apply(nativePlaybackRateGetter, video, []) === 0
          ) {
            return;
          }
          stats.startupWarmupResumeAttempts += 1;
          recordPlaybackIncident("startup-warmup-resume", video, {
            reason: "official-rate-zero-warmup",
          });
          let playResult;
          try {
            playResult = Reflect.apply(managedMediaPlay, video, []);
          } catch {
            stats.startupWarmupResumeRejections += 1;
            return;
          }
          Promise.resolve(playResult).catch(() => {
            if (!isPlaybackTaskCurrent(scope)) return;
            stats.startupWarmupResumeRejections += 1;
          });
        });
      }
      return result;
    }
    hookRegistry.define(
      pauseMethod.owner,
      "pause",
      { ...pauseMethod.descriptor, value: pause },
      "HTMLMediaElement.prototype.pause startup warm-up",
    );

    const attemptSafetyNet = (video, reason) => {
      const state = stateFor(video);
      const now = monotonicNow();
      updateReadyWindow(video, state);
      if (
        !state.route ||
        !state.source ||
        state.hasProgressed ||
        state.userPaused ||
        hasUserMediaIntent(video, "pause") ||
        state.safetyNetPending ||
        state.attempts >= MAX_STARTUP_ATTEMPTS ||
        now - state.firstSeenAt > MAX_STARTUP_AGE_MS ||
        findPrimaryPlaybackVideo(video) !== video ||
        isAuxiliaryVideo(video) ||
        hasActiveAuxiliaryPlayback(video) ||
        !video.paused ||
        video.ended ||
        video.seeking ||
        video.readyState < 2 ||
        !hasPlayableBuffer(video) ||
        !Number.isFinite(video.currentTime) ||
        video.currentTime > 0.5
      ) {
        return;
      }

      const readyForMs = now - state.readySince;
      if (readyForMs < MIN_READY_STALL_MS) {
        scheduleSafetyNet(video, reason, MIN_READY_STALL_MS - readyForMs);
        return;
      }

      state.safetyNetPending = true;
      state.attempts += 1;
      stats.startupPlayAttempts += 1;
      recordPlaybackIncident("startup-ready-stall", video, {
        reason,
        readyForMs: Number(readyForMs.toFixed(1)),
      });
      reportIssue(
        "Startup playback safety net",
        new Error(
          `Playable primary media remained paused for ${Math.round(readyForMs)} ms; issuing the single guarded play attempt.`,
        ),
        `startup-stall:${state.route}:${summarizeMediaSource(video)}`,
      );
      let result;
      const scope = capturePlaybackTaskScope(video);
      try {
        result = video.play();
      } catch (error) {
        state.safetyNetPending = false;
        stats.startupPlayRejections += 1;
        recordPlaybackIncident("startup-play-rejected", video, {
          errorName: error?.name ?? "Error",
          reason,
        });
        reportIssue(
          `Startup playback safety net rejected (${reason})`,
          error,
          `startup-play:${state.route}:${error?.name ?? "error"}`,
        );
        return;
      }
      Promise.resolve(result).then(
        () => {
          if (!isPlaybackTaskCurrent(scope) || videoStates.get(video) !== state)
            return;
          state.safetyNetPending = false;
        },
        (error) => {
          if (!isPlaybackTaskCurrent(scope) || videoStates.get(video) !== state)
            return;
          state.safetyNetPending = false;
          stats.startupPlayRejections += 1;
          recordPlaybackIncident("startup-play-rejected", video, {
            errorName: error?.name ?? "Error",
            reason,
          });
          reportIssue(
            `Startup playback safety net rejected (${reason})`,
            error,
            `startup-play:${state.route}:${error?.name ?? "error"}`,
          );
        },
      );
    };

    const onMediaEvent = (event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || !currentPlaybackRoute()) {
        return;
      }
      const state = stateFor(video);
      if (event.type === "progress" && video.currentTime > 0.5) {
        state.hasProgressed = true;
        state.safetyNetPending = false;
        return;
      }
      if (event.type === "playing") {
        if (
          !state.hasProgressed &&
          (state.safetyNetPending || state.attempts > 0)
        ) {
          stats.startupPlayRecoveries += 1;
          state.hasProgressed = true;
        } else if (video.currentTime > 0.5) {
          state.hasProgressed = true;
        }
        state.safetyNetPending = false;
        return;
      }
      if (event.type === "pause" && hasUserMediaIntent(video, "pause")) {
        state.userPaused = true;
        return;
      }
      if (event.type === "play") {
        state.userPaused = false;
        return;
      }
      updateReadyWindow(video, state);
      scheduleSafetyNet(video, event.type);
    };

    subscribeMediaEvents(
      [
        "loadstart",
        "loadedmetadata",
        "loadeddata",
        "canplay",
        "progress",
        "pause",
        "play",
        "playing",
        "stalled",
        "waiting",
      ],
      onMediaEvent,
      "startup playback",
    );

    lifecycleCallbacks.reconcilePrimaryPlayback = (reason = "reconcile") => {
      const primaries = new Set();
      for (const video of document.querySelectorAll("video")) {
        const primary = findPrimaryPlaybackVideo(video);
        if (primary) {
          primaries.add(primary);
        }
      }
      for (const primary of primaries) {
        const state = stateFor(primary);
        updateReadyWindow(primary, state);
        scheduleSafetyNet(primary, reason);
      }
    };
    for (const [target, type, options] of [
      [document, "visibilitychange", undefined],
      [document, "resume", undefined],
      [root, "focus", true],
      [root, "online", undefined],
      [root, "pageshow", undefined],
    ]) {
      addManagedEventListener(
        target,
        type,
        () => lifecycleCallbacks.reconcilePrimaryPlayback(type),
        options,
        `startup safety net ${type}`,
      );
    }
    lifecycleCallbacks.reconcilePrimaryPlayback("initial");
  }
  // Late document-start delivery can leave already-consumed LIVE data in the
  // application's store. Repair that data through its own setter; hiding the
  // installation layer cannot update the player's P2P/quality state.
  // Contract: current React root + Jotai useAtomValue [value, store, atom].
  function findStartupFiberRoot() {
    const container = root.document.getElementById("root");
    if (!container) return null;
    const candidates = [container];
    for (let index = 0; index < candidates.length && index < 32; index += 1) {
      const candidate = candidates[index];
      const keys = Object.keys(candidate);
      const containerKey = keys.find((name) =>
        name.startsWith("__reactContainer$"),
      );
      if (containerKey) {
        const fiber = candidate[containerKey];
        return fiber?.stateNode?.current ?? fiber ?? null;
      }
      const fiberKey = keys.find((name) => name.startsWith("__reactFiber$"));
      if (fiberKey) {
        let fiber = candidate[fiberKey];
        let depth = 0;
        while (fiber?.return && depth++ < 256) fiber = fiber.return;
        return fiber?.stateNode?.current ?? fiber ?? null;
      }
      for (const child of candidate.children ?? []) {
        if (candidates.length >= 32) break;
        candidates.push(child);
      }
    }
    return null;
  }

  function findStartupPlaybackAtoms(
    channelId,
    fiberRoot = findStartupFiberRoot(),
  ) {
    if (!fiberRoot) return [];

    const stack = [fiberRoot];
    const seenFibers = new WeakSet();
    const seenAtoms = new WeakSet();
    const matches = [];
    let visited = 0;
    while (stack.length && visited++ < 4_000) {
      const fiber = stack.pop();
      if (!isObject(fiber) || seenFibers.has(fiber)) continue;
      seenFibers.add(fiber);
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
      if (![0, 11, 14, 15].includes(fiber.tag)) continue;
      let hook = fiber.memoizedState;
      let hooks = 0;
      while (hook && hooks++ < 128) {
        const tuple = hook.memoizedState;
        hook = hook.next;
        if (!Array.isArray(tuple) || tuple.length !== 3) continue;
        const [value, store, atom] = tuple;
        if (
          !isRecord(value) ||
          value.channel?.channelId !== channelId ||
          typeof value.liveId !== "number" ||
          value.status !== "OPEN" ||
          typeof value.livePlaybackJson !== "string" ||
          !value.livePlaybackJson.includes('"p2pPath"') ||
          !isObject(store) ||
          typeof store.get !== "function" ||
          typeof store.set !== "function" ||
          typeof store.sub !== "function" ||
          !isObject(atom) ||
          !hasOwn(atom, "init") ||
          atom.init !== undefined ||
          typeof atom.read !== "function" ||
          typeof atom.write !== "function" ||
          seenAtoms.has(atom)
        )
          continue;
        seenAtoms.add(atom);
        if (store.get(atom) === value) matches.push({ value, store, atom });
      }
    }
    return matches;
  }

  // The current LIVE page keeps playback data in a React useState hook instead
  // of the older Jotai atom. Use the hook's own dispatch function and require the
  // rendered state, queue state, route and payload identity to agree.
  function findStartupPlaybackStateHooks(
    channelId,
    fiberRoot = findStartupFiberRoot(),
  ) {
    if (!fiberRoot) return [];

    const stack = [fiberRoot];
    const seenFibers = new WeakSet();
    const seenQueues = new WeakSet();
    const matches = [];
    let visited = 0;
    while (stack.length && visited++ < 4_000) {
      const fiber = stack.pop();
      if (!isObject(fiber) || seenFibers.has(fiber)) continue;
      seenFibers.add(fiber);
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
      if (![0, 11, 14, 15].includes(fiber.tag)) continue;
      let hook = fiber.memoizedState;
      let hooks = 0;
      while (hook && hooks++ < 128) {
        const value = hook.memoizedState;
        const queue = hook.queue;
        hook = hook.next;
        if (
          !isRecord(value) ||
          value.channelId !== channelId ||
          typeof value.liveId !== "number" ||
          typeof value.livePlaybackJson !== "string" ||
          !isObject(queue) ||
          typeof queue.dispatch !== "function" ||
          typeof queue.lastRenderedReducer !== "function" ||
          queue.lastRenderedState !== value ||
          seenQueues.has(queue)
        )
          continue;
        seenQueues.add(queue);
        matches.push({ value, queue });
      }
    }
    return matches;
  }

  function installStartupStateRecovery() {
    const document = root.document;
    if (
      !document?.getElementById ||
      !root.MutationObserver ||
      typeof root.setTimeout !== "function"
    )
      return;

    let disposed = false;
    let route = null;
    let routeVersion = -1;
    let active = null;
    const liveChannel = () =>
      root.location?.pathname
        ?.match(/^\/live\/([0-9a-f]{32})(?:\/|$)/i)?.[1]
        ?.toLowerCase() ?? "";

    function stop() {
      const job = active;
      if (!job) return;
      active = null;
      job.observer.disconnect();
      if (job.deadline !== null) root.clearTimeout(job.deadline);
      if (job.verification !== null) root.clearTimeout(job.verification);
      job.deadline = null;
      job.verification = null;
    }
    function installationGateVisible() {
      const help = document.querySelector(
        'a[href="https://help.naver.com/alias/navergame/chzzk6.naver"]',
      );
      if (!help) return false;
      const rect = help.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function check(job) {
      job.scheduled = false;
      if (disposed || active !== job) return;
      if (
        liveChannel() !== job.channelId ||
        job.navigation !== refreshPlaybackNavigation()
      )
        return refreshRoute();
      const fiberRoot = findStartupFiberRoot();
      const stateHooks = findStartupPlaybackStateHooks(
        job.channelId,
        fiberRoot,
      );
      for (const { value, queue } of stateHooks) {
        if (job.pendingState.get(queue) !== value) continue;
        job.pendingState.delete(queue);
        stats.lateStartupRecoveries += 1;
        stop();
        return;
      }
      // React may replace or detach the rendered fiber immediately after the
      // dispatch. The queue is the dispatch contract we already validated;
      // its last rendered state is therefore the durable commit check even
      // when the next fiber scan no longer reaches the previous hook object.
      for (const [queue, replacement] of job.pendingState) {
        if (queue.lastRenderedState !== replacement) continue;
        job.pendingState.delete(queue);
        stats.lateStartupRecoveries += 1;
        stop();
        return;
      }
      // Successful early interception needs no application-state adapter.
      if (
        job.pendingState.size === 0 &&
        stats.directTracks > job.initialDirectTracks &&
        !installationGateVisible()
      ) {
        stop();
        return;
      }
      const initial = job.first;
      job.first = false;
      if (!initial && !installationGateVisible()) return;
      try {
        let recovered = false;
        stats.startupRecoveryScans += 1;
        for (const { value, store, atom } of findStartupPlaybackAtoms(
          job.channelId,
          fiberRoot,
        )) {
          if (job.attempted.has(atom)) continue;
          const playback = Reflect.apply(nativeJsonParse, JSON, [
            value.livePlaybackJson,
          ]);
          const usable = playback?.media?.some(
            (media) =>
              Array.isArray(media?.encodingTrack) &&
              media.encodingTrack.some((track) =>
                Boolean(directUrlFromP2pPath(track?.p2pPath)),
              ),
          );
          if (!usable || store.get(atom) !== value) continue;
          job.attempted.add(atom);
          stats.lateStartupRecoveryAttempts += 1;
          const replacement = Reflect.apply(nativeJsonParse, JSON, [
            Reflect.apply(nativeJsonStringify, JSON, [value]),
          ]);
          if (!rewriteLiveContent(replacement)) continue;
          store.set(atom, replacement);
          if (store.get(atom) === replacement) {
            stats.lateStartupRecoveries += 1;
            recovered = true;
          }
        }
        for (const { value, queue } of stateHooks) {
          if (
            job.attemptedState.has(queue) ||
            !value.livePlaybackJson.includes('"p2pPath"')
          )
            continue;
          const playback = Reflect.apply(nativeJsonParse, JSON, [
            value.livePlaybackJson,
          ]);
          const usable = playback?.media?.some(
            (media) =>
              Array.isArray(media?.encodingTrack) &&
              media.encodingTrack.some((track) =>
                Boolean(directUrlFromP2pPath(track?.p2pPath)),
              ),
          );
          if (!usable || queue.lastRenderedState !== value) continue;
          job.attemptedState.add(queue);
          stats.lateStartupRecoveryAttempts += 1;
          const replacement = Reflect.apply(nativeJsonParse, JSON, [
            Reflect.apply(nativeJsonStringify, JSON, [value]),
          ]);
          if (!rewriteLiveContent(replacement)) continue;
          job.pendingState.set(queue, replacement);
          Reflect.apply(queue.dispatch, undefined, [replacement]);
          if (job.verification === null)
            job.verification = root.setTimeout(function verifyStateUpdate() {
              job.verification = null;
              schedule(job);
            }, 0);
        }
        if (recovered) stop();
      } catch (error) {
        reportIssue(
          "Late startup state recovery",
          error,
          "late-startup-state-recovery",
        );
        stop();
      }
    }
    function schedule(job) {
      if (!disposed && active === job && !job.scheduled) {
        job.scheduled = true;
        enqueueMicrotask(() => check(job));
      }
    }
    function refreshRoute(force = false) {
      if (disposed) return;
      const next = liveChannel();
      const navigation = refreshPlaybackNavigation();
      if (next === route && navigation === routeVersion && !force) return;
      stop();
      route = next;
      routeVersion = navigation;
      if (!next) return;
      const job = {
        channelId: next,
        navigation,
        attempted: new WeakSet(),
        attemptedState: new WeakSet(),
        pendingState: new Map(),
        first: true,
        scheduled: false,
        deadline: null,
        verification: null,
        initialDirectTracks: stats.directTracks,
        observer: null,
      };
      job.observer = new root.MutationObserver(() => schedule(job));
      active = job;
      stats.startupRecoveryWindows += 1;
      job.observer.observe(document, { childList: true, subtree: true });
      job.deadline = root.setTimeout(function stopWindow() {
        if (active === job) {
          if (job.pendingState.size)
            reportIssue(
              "Late startup state recovery",
              new Error(
                "React state update was not committed before deadline.",
              ),
              "late-startup-state-recovery",
            );
          stop();
        }
      }, 30_000);
      schedule(job);
    }
    const routeChanged = () => {
      // Keep native History API return values and exceptions independent of the
      // recovery adapter, and let the application's synchronous navigation finish.
      enqueueMicrotask(() => {
        try {
          refreshRoute();
        } catch (error) {
          stop();
          reportIssue("LIVE route recovery", error, "live-route-recovery");
        }
      });
    };
    hookRegistry.addCleanup("late startup state recovery", () => {
      disposed = true;
      stop();
    });
    subscribePlaybackNavigation(
      routeChanged,
      "LIVE navigation recovery subscription",
    );
    addManagedEventListener(
      root,
      "popstate",
      routeChanged,
      false,
      "LIVE route popstate",
    );
    addManagedEventListener(
      root,
      "pageshow",
      (event) => {
        if (event.persisted) {
          route = null;
          routeChanged();
        }
      },
      false,
      "LIVE route pageshow",
    );
    refreshRoute();
  }
  function installDiagnostics() {
    const knownConflicts = () => {
      const conflicts = [];
      if (root[ADGUARD_FILTER_MARKER]) {
        conflicts.push(
          Object.freeze({
            id: "chzzk-adguard-filter",
            message:
              "The overlapping chzzk.com AdGuard scriptlet rewrites ad session responses; disable that rule while this userscript is active.",
          }),
        );
      }
      return Object.freeze(conflicts);
    };

    const auditHookHealth = (reason) => {
      for (const hook of hookRegistry.health()) {
        if (hook.state === "superseded") {
          reportIssue(
            `Hook health audit (${reason})`,
            `${hook.label} was superseded by another script.`,
            `hook-superseded:${hook.label}`,
          );
        }
      }
      for (const conflict of knownConflicts()) {
        reportIssue(
          `Compatibility audit (${reason})`,
          conflict.message,
          `known-conflict:${conflict.id}`,
        );
      }
    };
    const api = Object.freeze({
      version: VERSION,
      getStats: () => Object.freeze({ ...stats }),
      getPreferences: () => sanitizePlayerPreferences(readPlayerPreferences()),
      getFailures: () => Object.freeze([...failures]),
      getIssues: () => Object.freeze([...issues]),
      getPlaybackIncidents: () => Object.freeze([...playbackIncidents]),
      getHealth: () => {
        const hooks = hookRegistry.health();
        return Object.freeze({
          healthy: hooks.every(
            ({ state }) =>
              state === "direct" || state === "managed" || state === "released",
          ),
          hooks,
          installation: installation.status,
          installationStage: installation.stage,
          knownConflicts: knownConflicts(),
          tunnelProtocols: Object.freeze(
            TUNNEL_PROTOCOLS.map(({ algorithm, label }) =>
              Object.freeze({ algorithm, label }),
            ),
          ),
        });
      },
    });
    hookRegistry.define(
      root,
      "__CHZZK_P2P_BYPASS__",
      { configurable: true, value: api },
      "diagnostics API",
    );
    if (typeof root.addEventListener === "function") {
      for (const type of ["load", "pageshow", "focus"]) {
        addManagedEventListener(
          root,
          type,
          () => auditHookHealth(type),
          true,
          `hook health ${type}`,
        );
      }
    }
    if (root.document?.addEventListener) {
      addManagedEventListener(
        root.document,
        "visibilitychange",
        () => {
          if (root.document.visibilityState === "visible") {
            auditHookHealth("visibilitychange");
          }
        },
        true,
        "hook health visibility",
      );
    }
    auditHookHealth("installation");
  }
  // Order is intentional: early protocol hooks precede application code,
  // subscribers are registered before the shared media-event hub is attached,
  // and diagnostics is published only after every functional hook exists.
  const INSTALLATION_STAGES = Object.freeze(
    IS_CLIP_FRAME
      ? [
          Object.freeze({
            id: "playback-task-scope",
            install: installPlaybackTaskScope,
          }),
          Object.freeze({
            id: "clip-player",
            install: installClipPlayerEnhancements,
          }),
          Object.freeze({ id: "diagnostics", install: installDiagnostics }),
        ]
      : [
          Object.freeze({
            id: "playback-task-scope",
            install: installPlaybackTaskScope,
          }),
          Object.freeze({
            id: "playback-signal-guards",
            install: installPlaybackSignalGuards,
          }),
          Object.freeze({
            id: "json-hook",
            install: () => {
              lifecycleCallbacks.releaseJsonFallback = installJsonHook();
            },
          }),
          Object.freeze({ id: "response-hook", install: installResponseHook }),
          Object.freeze({ id: "tunnel-hooks", install: installTunnelHooks }),
          Object.freeze({ id: "ad-bait-hook", install: installAdBaitHook }),
          Object.freeze({
            id: "mute-indicator-state",
            install: installMuteIndicatorState,
          }),
          Object.freeze({
            id: "ad-playback-mock",
            install: installAdPlaybackMock,
          }),
          Object.freeze({
            id: "home-top-skin-ad-suppression",
            install: installHomeTopSkinAdSuppression,
          }),
          Object.freeze({
            id: "media-intent-tracker",
            install: installMediaIntentTracker,
          }),
          Object.freeze({
            id: "vod-volume-keyboard-focus",
            install: installVodVolumeKeyboardFocus,
          }),
          Object.freeze({
            id: "player-preferences",
            install: installPlayerPreferences,
          }),
          Object.freeze({
            id: "startup-playback-safety-net",
            install: installStartupPlaybackSafetyNet,
          }),
          Object.freeze({
            id: "media-event-hub",
            install: installMediaEventHub,
          }),
          Object.freeze({
            id: "startup-state-recovery",
            install: installStartupStateRecovery,
          }),
          Object.freeze({ id: "diagnostics", install: installDiagnostics }),
        ],
  );

  try {
    for (const stage of INSTALLATION_STAGES) {
      installation.stage = stage.id;
      stage.install();
    }
    installation.stage = "complete";
    installation.status = "active";
    Object.defineProperty(root, INSTALL_MARKER, {
      configurable: false,
      value: installation,
    });
    console.info(PREFIX, `v${VERSION} active`);
  } catch (error) {
    const failure = reportFailure(
      `Initialization (${installation.stage})`,
      error,
    );
    installation.failure = Object.freeze({
      message: failure.message,
      name: failure.name,
    });
    installation.status = "failed";
    hookRegistry.rollback();
    throw failure;
  }
})();
