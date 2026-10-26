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
  const gridBypassInput = document.getElementById("gridBypass");
  const autoAdSkipInput = document.getElementById("autoAdSkip");
  const autoDismissPopupInput = document.getElementById("autoDismissPopup");
  chrome.storage.local.get(["settings"], (res) => {
    const settings = { ...DEFAULT_SETTINGS, ...res.settings || {} };
    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;
  });
  const saveSettings = () => {
    const newSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      autoAdSkip: autoAdSkipInput?.checked ?? true,
      autoDismissPopup: autoDismissPopupInput?.checked ?? true,
      preferredQuality: 1080
    };
    chrome.storage.local.set({ settings: newSettings }, () => {
      console.log("[ChzzkClean] 설정 변경 완료:", newSettings);
    });
  };
  gridBypassInput?.addEventListener("change", saveSettings);
  autoAdSkipInput?.addEventListener("change", saveSettings);
  autoDismissPopupInput?.addEventListener("change", saveSettings);
});
