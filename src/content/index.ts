/**
 * 치지직 클린 컨텐트 스크립트
 * 웹페이지 메인 월드에 injected.js를 주입합니다.
 */
(() => {
  const injectScript = (filePath: string) => {
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
