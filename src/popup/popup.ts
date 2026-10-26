import { DEFAULT_SETTINGS, UserSettings } from "../types/chzzk";

/**
 * 팝업 설정 UI 제어 스크립트
 */
document.addEventListener("DOMContentLoaded", () => {
  const versionText = document.getElementById("versionText");
  const gridBypassInput = document.getElementById("gridBypass") as HTMLInputElement;
  const lowLatencyModeInput = document.getElementById("lowLatencyMode") as HTMLInputElement;
  const autoAdSkipInput = document.getElementById("autoAdSkip") as HTMLInputElement;
  const autoDismissPopupInput = document.getElementById("autoDismissPopup") as HTMLInputElement;

  // 1. 버전 표시 자동 동기화 (manifest.json 기반)
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionText && manifest?.version) {
      versionText.textContent = `v${manifest.version}`;
    }
  } catch (e) {
    console.warn("[ChzzkClean] 매니페스트 버전 로드 실패:", e);
  }

  // 2. 기존 설정 로드
  chrome.storage.local.get(["settings"], (res) => {
    const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };

    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (lowLatencyModeInput) lowLatencyModeInput.checked = settings.lowLatencyMode;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;
  });

  // 3. 치지직 탭들에 실시간 변경 메시지 브로드캐스트
  const notifyTabs = (settings: UserSettings) => {
    if (!chrome.tabs) return;

    chrome.tabs.query({ url: ["*://chzzk.naver.com/*", "*://*.chzzk.naver.com/*"] }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            source: "CHZZK_CLEAN_EXT",
            type: "SETTINGS_UPDATED",
            settings,
          }).catch(() => {
            // 탭이 아직 준비되지 않았거나 연결되지 않은 경우 무시
          });
        }
      });
    });
  };

  // 4. 설정 변경 리스너
  const saveSettings = () => {
    const newSettings: UserSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      lowLatencyMode: lowLatencyModeInput?.checked ?? true,
      autoAdSkip: autoAdSkipInput?.checked ?? true,
      autoDismissPopup: autoDismissPopupInput?.checked ?? true,
      preferredQuality: 1080,
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
