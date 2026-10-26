import { DEFAULT_SETTINGS, UserSettings } from "../types/chzzk";

/**
 * 팝업 설정 UI 제어 스크립트
 */
document.addEventListener("DOMContentLoaded", () => {
  const gridBypassInput = document.getElementById("gridBypass") as HTMLInputElement;
  const autoAdSkipInput = document.getElementById("autoAdSkip") as HTMLInputElement;
  const autoDismissPopupInput = document.getElementById("autoDismissPopup") as HTMLInputElement;

  // 1. 기존 설정 로드
  chrome.storage.local.get(["settings"], (res) => {
    const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };

    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;
  });

  // 2. 설정 변경 리스너
  const saveSettings = () => {
    const newSettings: UserSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      autoAdSkip: autoAdSkipInput?.checked ?? true,
      autoDismissPopup: autoDismissPopupInput?.checked ?? true,
      preferredQuality: 1080,
    };

    chrome.storage.local.set({ settings: newSettings }, () => {
      console.log("[ChzzkClean] 설정 변경 완료:", newSettings);
    });
  };

  gridBypassInput?.addEventListener("change", saveSettings);
  autoAdSkipInput?.addEventListener("change", saveSettings);
  autoDismissPopupInput?.addEventListener("change", saveSettings);
});
