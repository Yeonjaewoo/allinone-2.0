class AdInterceptor {
  static VETA_RE = /(?:veta|siape|nam|tivan)\.naver\.com\//;
  static BANNER_RE = /^https:\/\/nng-phinf\.pstatic\.net\/[A-Za-z]+\/[A-Za-z0-9._-]+\/Banner_[A-Za-z0-9_-]+\.[A-Za-z]+$/;
  static install() {
    if (window.__CHZZK_CLEAN_AD_INTERCEPTOR_INSTALLED__) return;
    window.__CHZZK_CLEAN_AD_INTERCEPTOR_INSTALLED__ = true;
    this.hookFetch();
    this.hookXHR();
    console.info("[ChzzkClean] 광고 인터셉터 및 안티-애드블록 우회 엔진 활성화 완료");
  }
  static hookFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource?.url ?? "";
      const method = (config?.method ?? "GET").toUpperCase();
      if (method === "OPTIONS" && this.VETA_RE.test(url)) {
        return new Response(JSON.stringify({ code: 200, message: "OK" }), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" }
        });
      }
      if (this.VETA_RE.test(url) && (url.includes("vas") || url.includes("schedule") || url.includes("gfp"))) {
        return new Response(
          JSON.stringify({
            head: { version: "0.0.1", description: "GFP Video Ad Schedule" },
            requestId: "vas-clean-mock",
            videoAdScheduleId: "LIVE_CHZZK_NDP_SCH",
            adBreaks: [{ id: "", startDelay: 0, preFetch: 0, adUnitId: "", adSources: [] }]
          }),
          { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }
        );
      }
      if (this.VETA_RE.test(url) && (url.includes("call") || url.includes("waterfall"))) {
        return new Response(
          JSON.stringify({
            head: { version: "0.0.1", description: "Naver SSP Waterfall List" },
            ads: [],
            videoSkipMin: 0,
            videoSkipAfter: 0
          }),
          { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }
        );
      }
      if (this.BANNER_RE.test(url)) {
        return new Response("", { status: 200 });
      }
      const response = await originalFetch(...args);
      if (url.includes("display-status")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: null,
            content: { playerAdDisplayResponse: { preRoll: false, midRoll: false } }
          }),
          { status: 200, headers: response.headers }
        );
      }
      if (url.includes("/seoraksan") || url.includes("live-detail") || url.includes("live-status")) {
        try {
          const clone = response.clone();
          const json = await clone.json();
          if (json?.content) {
            AdInterceptor.cleanPlaybackData(json.content);
          }
          return new Response(JSON.stringify(json), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch {
          return response;
        }
      }
      return response;
    };
  }
  /**
   * 광고 플래그 제거 및 P2P(그리드) 강제 비활성화
   */
  static cleanPlaybackData(content) {
    if (!content) return;
    if (content.playerAdDisplayResponse) {
      content.playerAdDisplayResponse.preRoll = false;
      content.playerAdDisplayResponse.midRoll = false;
    }
    content.skipPreRollAd = true;
    content.dab = false;
    if (content.livePlaybackJson) {
      try {
        const playback = typeof content.livePlaybackJson === "string" ? JSON.parse(content.livePlaybackJson) : content.livePlaybackJson;
        if (playback) {
          playback.p2p = false;
          delete playback.p2pQuality;
          delete playback.p2pUrl;
          content.livePlaybackJson = JSON.stringify(playback);
        }
      } catch {
      }
    }
  }
  static hookXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
    XMLHttpRequest.prototype.open = function(...args) {
      this._cleanMethod = args[0];
      this._cleanUrl = typeof args[1] === "string" ? args[1] : args[1]?.href || "";
      return originalOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      const url = this._cleanUrl || "";
      const method = (this._cleanMethod || "GET").toUpperCase();
      if (method === "OPTIONS" && AdInterceptor.VETA_RE.test(url)) {
        Object.defineProperty(this, "status", { get: () => 200 });
        Object.defineProperty(this, "statusText", { get: () => "OK" });
        Object.defineProperty(this, "responseText", { get: () => JSON.stringify({ code: 200, message: "OK" }) });
        this.dispatchEvent(new Event("load"));
        return;
      }
      this.addEventListener("readystatechange", function() {
        if (this.readyState === 4 && (url.includes("live-detail") || url.includes("/seoraksan"))) {
          try {
            const raw = originalResponseTextDesc?.get?.call(this);
            if (raw) {
              const data = JSON.parse(raw);
              if (data?.content) {
                AdInterceptor.cleanPlaybackData(data.content);
              }
              const modified = JSON.stringify(data);
              Object.defineProperty(this, "responseText", { get: () => modified });
              Object.defineProperty(this, "response", { get: () => modified });
            }
          } catch {
          }
        }
      });
      return originalSend.apply(this, args);
    };
  }
}

class GridBypass {
  static core = null;
  static lastAppliedHeight = 0;
  static monitorTimer = null;
  static install() {
    if (window.__CHZZK_CLEAN_GRID_BYPASS_INSTALLED__) return;
    window.__CHZZK_CLEAN_GRID_BYPASS_INSTALLED__ = true;
    this.emulateMacPlatform();
    this.startPlayerPolling();
    console.info("[ChzzkClean] 그리드 우회 및 1080p 고화질 고정 엔진 활성화 완료");
  }
  /**
   * 윈도우 환경에서 네이버 동영상 플러그인(웹스토어) 설치 강제를 우회하기 위해
   * 치지직 웹페이지에 한해 플랫폼 정보를 macOS로 에뮬레이트합니다.
   */
  static emulateMacPlatform() {
    try {
      Object.defineProperty(navigator, "platform", {
        get: () => "MacIntel",
        configurable: true
      });
      const originalUA = navigator.userAgent;
      if (originalUA.includes("Windows")) {
        const macUA = originalUA.replace(/Windows NT [0-9.]+; Win64; x64/i, "Macintosh; Intel Mac OS X 10_15_7");
        Object.defineProperty(navigator, "userAgent", {
          get: () => macUA,
          configurable: true
        });
      }
      const uaData = navigator.userAgentData;
      if (uaData) {
        Object.defineProperty(uaData, "platform", {
          get: () => "macOS",
          configurable: true
        });
      }
      console.info("[ChzzkClean] 네이버 동영상 플러그인 요구 우회 (플랫폼 위장 적용 완료)");
    } catch (e) {
      console.warn("[ChzzkClean] 플랫폼 위장 중 예외:", e.message);
    }
  }
  /**
   * 플레이어 인스턴스를 탐색하여 코어를 확보합니다.
   */
  static startPlayerPolling() {
    const timer = setInterval(() => {
      const core = this.findPlayerCore();
      if (core) {
        this.core = core;
        clearInterval(timer);
        this.applyBestQuality();
        this.startMonitor();
      }
    }, 500);
    setTimeout(() => clearInterval(timer), 15e3);
  }
  /**
   * DOM과 Vue 인스턴스를 탐색하여 PZP 플레이어 코어를 찾습니다.
   */
  static findPlayerCore() {
    const playerContainer = document.querySelector('[class*="live_player_"]') || document.querySelector('[class*="player_container"]') || document.querySelector(".pzp");
    if (!playerContainer) return null;
    const vue = playerContainer.__vue__;
    if (vue) {
      if (typeof vue.getVideoTracksList === "function") return vue;
      if (vue.$children) {
        for (const child of vue.$children) {
          if (typeof child.getVideoTracksList === "function") return child;
        }
      }
    }
    return null;
  }
  /**
   * P2P(그리드) 트랙을 배제하고 가장 품질이 좋은 Non-P2P 1080p 트랙을 적용합니다.
   */
  static applyBestQuality(targetHeight = 1080) {
    if (!this.core) {
      this.core = this.findPlayerCore();
      if (!this.core) return false;
    }
    try {
      const rawTracks = this.core.getVideoTracksList();
      if (!rawTracks) return false;
      const tracks = (Array.isArray(rawTracks) ? rawTracks : Object.values(rawTracks)).filter(
        (t) => t && typeof t.height === "number" && t.height > 0
      );
      if (tracks.length === 0) return false;
      const matchingTracks = tracks.filter((t) => t.height === targetHeight || Number(t.height) === targetHeight);
      let selectedTrack = null;
      if (matchingTracks.length > 0) {
        selectedTrack = matchingTracks.find((t) => {
          const id = (t.id || "").toLowerCase();
          return !id.includes("p2p") && !id.includes("grid");
        }) || matchingTracks[0];
      } else {
        const sorted = [...tracks].sort((a, b) => b.height - a.height);
        selectedTrack = sorted.find((t) => {
          const id = (t.id || "").toLowerCase();
          return !id.includes("p2p") && !id.includes("grid");
        }) || sorted[0];
      }
      if (selectedTrack) {
        this.core.setVideoTrack(selectedTrack);
        this.lastAppliedHeight = selectedTrack.height;
        console.info(`[ChzzkClean] 고화질 트랙 적용 완료: ${selectedTrack.label || selectedTrack.height + "p"} (ID: ${selectedTrack.id})`);
        return true;
      }
    } catch (e) {
      console.warn("[ChzzkClean] 화질 적용 중 예외 발생:", e.message);
    }
    return false;
  }
  /**
   * 화질이 멋대로 저화질로 떨어지는 것을 지속적으로 감시하고 1080p로 복구합니다.
   */
  static startMonitor() {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(() => {
      if (document.hidden) return;
      const video = document.querySelector("video");
      if (!video || video.paused) return;
      if (!this.core) {
        this.core = this.findPlayerCore();
      }
      if (this.core) {
        try {
          const rawTracks = this.core.getVideoTracksList();
          const current = (Array.isArray(rawTracks) ? rawTracks : Object.values(rawTracks)).find((t) => t?._selected);
          if (current && current.height < 720) {
            console.warn(`[ChzzkClean] 저화질 감지됨 (${current.height}p) -> 1080p 재적용 시도`);
            this.applyBestQuality(1080);
          }
        } catch {
        }
      }
    }, 4e3);
  }
}

class PopupDismiss {
  static AD_BLOCK_PATTERN = /광고\s*차단|애드블록|adblock|광고\s*방해없이|원활한\s*서비스\s*이용을\s*위해/i;
  static GRID_POPUP_PATTERN = /그리드\s*(프로그램)?\s*(설치|다운로드)|1080p\s*(화질)?\s*시청을\s*위해|고화질\s*시청을\s*위해|동영상\s*플러그인|플러그인\s*(설치|필요)|p2p/i;
  static install() {
    if (window.__CHZZK_CLEAN_POPUP_DISMISS_INSTALLED__) return;
    window.__CHZZK_CLEAN_POPUP_DISMISS_INSTALLED__ = true;
    this.startObserver();
    console.info("[ChzzkClean] 팝업 자동 감지 및 강제 차단 엔진 활성화 완료");
  }
  static startObserver() {
    const checkElement = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const text = node.textContent || "";
      const isAdBlock = this.AD_BLOCK_PATTERN.test(text);
      const isGrid = this.GRID_POPUP_PATTERN.test(text);
      if (isAdBlock || isGrid) {
        const popupContainer = node.closest('[role="dialog"]') || node.closest('[role="alertdialog"]') || node.closest('[class*="popup_container"]') || node.closest('[class*="modal"]') || node.closest('[class*="layer_"]') || node;
        if (popupContainer instanceof HTMLElement) {
          console.warn(`[ChzzkClean] 방해 팝업 감지 (${isAdBlock ? "광고차단 경고" : "그리드 설치 유도"}) -> 강제 제거`);
          popupContainer.style.setProperty("display", "none", "important");
          popupContainer.style.setProperty("visibility", "hidden", "important");
          popupContainer.style.setProperty("pointer-events", "none", "important");
          const closeBtn = popupContainer.querySelector('button[class*="close"]') || popupContainer.querySelector('button[class*="confirm"]') || popupContainer.querySelector("button");
          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }
          setTimeout(() => {
            const video = document.querySelector("video");
            if (video && video.paused) {
              video.play().catch(() => {
              });
            }
          }, 150);
        }
      }
      if (node.querySelector?.('a[href*="ooadnieabchijkibjpeieeliohjidnjj"]') || node.tagName === "A" && node.href?.includes("ooadnieabchijkibjpeieeliohjidnjj")) {
        node.style.setProperty("display", "none", "important");
      }
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added instanceof Element) {
            checkElement(added);
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    setInterval(() => {
      document.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="popup"], [class*="modal"]').forEach((el) => {
        checkElement(el);
      });
    }, 2e3);
  }
}

(() => {
  try {
    GridBypass.emulateMacPlatform();
    AdInterceptor.install();
    GridBypass.install();
    PopupDismiss.install();
    console.info("🎉 [ChzzkClean] 모든 엔진이 성공적으로 초기화되었습니다.");
  } catch (e) {
    console.error("[ChzzkClean] 초기화 중 오류 발생:", e);
  }
})();
