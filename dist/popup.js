import { D as DEFAULT_SETTINGS } from './chunks/chzzk.js';

true&&(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
}());

document.addEventListener("DOMContentLoaded", () => {
  const versionText = document.getElementById("versionText");
  const gridBypassInput = document.getElementById("gridBypass");
  const lowLatencyModeInput = document.getElementById("lowLatencyMode");
  const targetLatencyArea = document.getElementById("targetLatencyArea");
  const targetLatencyInput = document.getElementById("targetLatency");
  const targetLatencyValue = document.getElementById("targetLatencyValue");
  const targetLatencyDesc = document.getElementById("targetLatencyDesc");
  const chatLatencyDisplayInput = document.getElementById("chatLatencyDisplay");
  const autoAdSkipInput = document.getElementById("autoAdSkip");
  const autoDismissPopupInput = document.getElementById("autoDismissPopup");
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionText && manifest?.version) {
      versionText.textContent = `v${manifest.version}`;
    }
  } catch (e) {
    console.warn("[ChzzkClean] 매니페스트 버전 로드 실패:", e);
  }
  const updateLatencyUI = (val, isLLActive) => {
    if (targetLatencyValue) {
      targetLatencyValue.textContent = `${val.toFixed(1)}초`;
    }
    if (targetLatencyDesc) {
      if (val <= 1.5) {
        targetLatencyDesc.textContent = "초저지연: 빠른 소통 우선 (안정 회선 권장)";
      } else if (val <= 2.5) {
        targetLatencyDesc.textContent = "권장: 버퍼링 방지 및 실시간 소통 균형";
      } else {
        targetLatencyDesc.textContent = "안정 모드: 버퍼 여유 확보 (끊김 방지)";
      }
    }
    if (targetLatencyArea) {
      targetLatencyArea.style.opacity = isLLActive ? "1" : "0.4";
      targetLatencyArea.style.pointerEvents = isLLActive ? "auto" : "none";
    }
  };
  chrome.storage.local.get(["settings"], (res) => {
    const settings = { ...DEFAULT_SETTINGS, ...res.settings || {} };
    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (lowLatencyModeInput) lowLatencyModeInput.checked = settings.lowLatencyMode;
    if (targetLatencyInput) targetLatencyInput.value = String(settings.targetLatency ?? 2);
    if (chatLatencyDisplayInput) chatLatencyDisplayInput.checked = settings.chatLatencyDisplay;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;
    updateLatencyUI(settings.targetLatency ?? 2, settings.lowLatencyMode);
  });
  const notifyTabs = (settings) => {
    if (!chrome.tabs) return;
    chrome.tabs.query({ url: ["*://chzzk.naver.com/*", "*://*.chzzk.naver.com/*"] }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            source: "CHZZK_CLEAN_EXT",
            type: "SETTINGS_UPDATED",
            settings
          }).catch(() => {
          });
        }
      });
    });
  };
  const saveSettings = () => {
    const targetLatencyVal = targetLatencyInput ? parseFloat(targetLatencyInput.value) : 2;
    const isLLActive = lowLatencyModeInput?.checked ?? true;
    updateLatencyUI(targetLatencyVal, isLLActive);
    const newSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      lowLatencyMode: isLLActive,
      targetLatency: targetLatencyVal,
      chatLatencyDisplay: chatLatencyDisplayInput?.checked ?? true,
      autoAdSkip: autoAdSkipInput?.checked ?? true,
      autoDismissPopup: autoDismissPopupInput?.checked ?? true,
      preferredQuality: 1080
    };
    chrome.storage.local.set({ settings: newSettings }, () => {
      console.log("[ChzzkClean] 설정 변경 완료:", newSettings);
      notifyTabs(newSettings);
    });
  };
  gridBypassInput?.addEventListener("change", saveSettings);
  lowLatencyModeInput?.addEventListener("change", saveSettings);
  targetLatencyInput?.addEventListener("input", saveSettings);
  chatLatencyDisplayInput?.addEventListener("change", saveSettings);
  autoAdSkipInput?.addEventListener("change", saveSettings);
  autoDismissPopupInput?.addEventListener("change", saveSettings);
});
