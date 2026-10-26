(() => {
  const injectScript = (filePath) => {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(filePath);
      script.async = false;
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => script.remove();
    } catch (e) {
      console.error("[ChzzkClean] 스크립트 주입 실패:", e);
    }
  };
  injectScript("injected.js");
})();
