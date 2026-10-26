/**
 * 치지직 방해 팝업(광고차단 경고, 그리드 설치 유도) 자동 감지 및 제거기
 */
export class PopupDismiss {
  private static readonly AD_BLOCK_PATTERN =
    /광고\s*차단|애드블록|adblock|광고\s*방해없이|원활한\s*서비스\s*이용을\s*위해/i;

  private static readonly GRID_POPUP_PATTERN =
    /그리드\s*(프로그램)?\s*(설치|다운로드)|1080p\s*(화질)?\s*시청을\s*위해|고화질\s*시청을\s*위해|p2p/i;

  public static install(): void {
    if ((window as any).__CHZZK_CLEAN_POPUP_DISMISS_INSTALLED__) return;
    (window as any).__CHZZK_CLEAN_POPUP_DISMISS_INSTALLED__ = true;

    this.startObserver();
    console.info("[ChzzkClean] 팝업 자동 감지 및 강제 차단 엔진 활성화 완료");
  }

  private static startObserver(): void {
    const checkElement = (node: Element) => {
      if (!(node instanceof HTMLElement)) return;

      const text = node.textContent || "";
      const isAdBlock = this.AD_BLOCK_PATTERN.test(text);
      const isGrid = this.GRID_POPUP_PATTERN.test(text);

      if (isAdBlock || isGrid) {
        // 팝업 컨테이너 또는 다이얼로그 탐색
        const popupContainer =
          node.closest('[role="dialog"]') ||
          node.closest('[role="alertdialog"]') ||
          node.closest('[class*="popup_container"]') ||
          node.closest('[class*="modal"]') ||
          node.closest('[class*="layer_"]') ||
          node;

        if (popupContainer instanceof HTMLElement) {
          console.warn(`[ChzzkClean] 방해 팝업 감지 (${isAdBlock ? "광고차단 경고" : "그리드 설치 유도"}) -> 강제 제거`);

          // 1. 화면에서 즉시 숨김
          popupContainer.style.setProperty("display", "none", "important");
          popupContainer.style.setProperty("visibility", "hidden", "important");
          popupContainer.style.setProperty("pointer-events", "none", "important");

          // 2. 닫기/확인 버튼 자동 클릭
          const closeBtn =
            popupContainer.querySelector('button[class*="close"]') ||
            popupContainer.querySelector('button[class*="confirm"]') ||
            popupContainer.querySelector("button");

          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }

          // 3. 영상이 일시정지되었을 경우 자동 재생 복구
          setTimeout(() => {
            const video = document.querySelector("video");
            if (video && video.paused) {
              video.play().catch(() => {});
            }
          }, 150);
        }
      }
    };

    // DOM 실시간 감시
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added instanceof Element) {
            checkElement(added);
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 2초 주기 백업 스캔
    setInterval(() => {
      document.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="popup"], [class*="modal"]').forEach((el) => {
        checkElement(el);
      });
    }, 2000);
  }
}
