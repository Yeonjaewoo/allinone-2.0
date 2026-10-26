import { DEFAULT_SETTINGS, UserSettings } from "../types/chzzk";

/**
 * 팝업 설정 UI 제어 스크립트
 */
document.addEventListener("DOMContentLoaded", () => {
  const versionText = document.getElementById("versionText");
  const gridBypassInput = document.getElementById("gridBypass") as HTMLInputElement;
  const lowLatencyModeInput = document.getElementById("lowLatencyMode") as HTMLInputElement;
  const targetLatencyArea = document.getElementById("targetLatencyArea") as HTMLElement;
  const targetLatencyInput = document.getElementById("targetLatency") as HTMLInputElement;
  const targetLatencyValue = document.getElementById("targetLatencyValue") as HTMLElement;
  const targetLatencyDesc = document.getElementById("targetLatencyDesc") as HTMLElement;
  const chatLatencyDisplayInput = document.getElementById("chatLatencyDisplay") as HTMLInputElement;
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

  const updateLatencyUI = (val: number, isLLActive: boolean) => {
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

  // 2. 기존 설정 로드
  chrome.storage.local.get(["settings"], (res) => {
    const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };

    if (gridBypassInput) gridBypassInput.checked = settings.gridBypassEnabled;
    if (lowLatencyModeInput) lowLatencyModeInput.checked = settings.lowLatencyMode;
    if (targetLatencyInput) targetLatencyInput.value = String(settings.targetLatency ?? 2.0);
    if (chatLatencyDisplayInput) chatLatencyDisplayInput.checked = settings.chatLatencyDisplay;
    if (autoAdSkipInput) autoAdSkipInput.checked = settings.autoAdSkip;
    if (autoDismissPopupInput) autoDismissPopupInput.checked = settings.autoDismissPopup;

    updateLatencyUI(settings.targetLatency ?? 2.0, settings.lowLatencyMode);
  });

  // 3. 치지직 탭들에 실시간 변경 메시지 브로드캐스트
  const notifyTabs = (settings: UserSettings) => {
    if (!chrome.tabs) return;

    // 치지직 URL을 포함하는 모든 탭을 탐색하여 즉시 메시지 전달
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.url && (tab.url.includes("chzzk.naver.com") || tab.url.includes("m.naver.com/shorts"))) {
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
    const targetLatencyVal = targetLatencyInput ? parseFloat(targetLatencyInput.value) : 2.0;
    const isLLActive = lowLatencyModeInput?.checked ?? true;

    updateLatencyUI(targetLatencyVal, isLLActive);

    const newSettings: UserSettings = {
      enabled: true,
      gridBypassEnabled: gridBypassInput?.checked ?? true,
      lowLatencyMode: isLLActive,
      targetLatency: targetLatencyVal,
      chatLatencyDisplay: chatLatencyDisplayInput?.checked ?? true,
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
  targetLatencyInput?.addEventListener("input", saveSettings);
  chatLatencyDisplayInput?.addEventListener("change", saveSettings);
  autoAdSkipInput?.addEventListener("change", saveSettings);
  autoDismissPopupInput?.addEventListener("change", saveSettings);
});
