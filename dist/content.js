(() => {
  const syncSettingsToPage = (settings) => {
    if (!settings) return;
    try {
      window.postMessage(
        {
          source: "CHZZK_CLEAN_EXT",
          type: "SETTINGS_UPDATED",
          settings
        },
        "*"
      );
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
  chrome.storage.local.get(["settings"], (res) => {
    if (res.settings) {
      syncSettingsToPage(res.settings);
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings?.newValue) {
      syncSettingsToPage(changes.settings.newValue);
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.source === "CHZZK_CLEAN_EXT" && message?.type === "SETTINGS_UPDATED") {
      syncSettingsToPage(message.settings);
    }
  });
})();
