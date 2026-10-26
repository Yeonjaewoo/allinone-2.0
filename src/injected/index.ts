import { AdInterceptor } from "./ad-interceptor";
import { GridBypass } from "./grid-bypass";
import { PopupDismiss } from "./popup-dismiss";

/**
 * 치지직 클린 메인 웹페이지 주입 스크립트
 */
(() => {
  try {
    // 1. 광고 차단 & 안티 애드블록 우회
    AdInterceptor.install();

    // 2. 그리드 우회 & 1080p 고화질 고정
    GridBypass.install();

    // 3. 팝업 자동 감지 및 제거
    PopupDismiss.install();

    console.info("🎉 [ChzzkClean] 모든 엔진이 성공적으로 초기화되었습니다.");
  } catch (e: any) {
    console.error("[ChzzkClean] 초기화 중 오류 발생:", e);
  }
})();
