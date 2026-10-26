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
  chrome.storage.local.get(["settings"], (res) => {
    const settings = { ...DEFAULT_SETTINGS, ...res.settings || {} };
    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (lowLatencyModeInput) lowLatencyModeInput.checked = settings.lowLatencyMode;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;
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
    const newSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      lowLatencyMode: lowLatencyModeInput?.checked ?? true,
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
  autoAdSkipInput?.addEventListener("change", saveSettings);
  autoDismissPopupInput?.addEventListener("change", saveSettings);
});
