/**
 * 치지직 클린 컨텐트 스크립트 (ISOLATED 월드)
 * 확장프로그램 스토리지/팝업과 메인 월드(injected.js) 사이의 통신 브릿지 역할을 수행합니다.
 */
(() => {
  const syncSettingsToPage = (settings: any) => {
    if (!settings) return;
    try {
      // 1. postMessage를 통해 MAIN 월드로 실시간 전달
      window.postMessage(
        {
          source: "CHZZK_CLEAN_EXT",
          type: "SETTINGS_UPDATED",
          settings,
        },
        "*"
      );

      // 2. DOM attribute에 동기적 기록 및 커스텀 이벤트 디스패치
      if (document.documentElement) {
        document.documentElement.setAttribute(
          "data-chzzk-clean-settings",
          JSON.stringify(settings)
        );
        document.documentElement.dispatchEvent(
          new CustomEvent("chzzk-clean-settings-changed", { detail: settings })
        );
      }
    } catch (e) {
      console.warn("[ChzzkClean] 설정 동기화 중 오류:", e);
    }
  };

  // 초기 설정 로드 및 주입
  chrome.storage.local.get(["settings"], (res) => {
    if (res.settings) {
      syncSettingsToPage(res.settings);
    }
  });

  // 스토리지 변경 실시간 감지
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings?.newValue) {
      syncSettingsToPage(changes.settings.newValue);
    }
  });

  // 팝업으로부터 직접 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.source === "CHZZK_CLEAN_EXT" && message?.type === "SETTINGS_UPDATED") {
      syncSettingsToPage(message.settings);
    }
  });
})();
