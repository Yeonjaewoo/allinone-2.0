import { D as DEFAULT_SETTINGS } from './chunks/chzzk.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["settings"], (res) => {
    if (!res.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      console.info("[ChzzkClean] 기본 설정 저장 완료");
    }
  });
});
