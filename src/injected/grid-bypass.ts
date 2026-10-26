import { PlayerCore, VideoTrack } from "../types/chzzk";

/**
 * 그리드 우회 및 화질 고정 매니저
 */
export class GridBypass {
  private static core: PlayerCore | null = null;
  private static lastAppliedHeight = 0;
  private static monitorTimer: any = null;

  public static install(): void {
    if ((window as any).__CHZZK_CLEAN_GRID_BYPASS_INSTALLED__) return;
    (window as any).__CHZZK_CLEAN_GRID_BYPASS_INSTALLED__ = true;

    this.startPlayerPolling();
    console.info("[ChzzkClean] 그리드 우회 및 1080p 고화질 고정 엔진 활성화 완료");
  }

  /**
   * 플레이어 인스턴스를 탐색하여 코어를 확보합니다.
   */
  private static startPlayerPolling(): void {
    const timer = setInterval(() => {
      const core = this.findPlayerCore();
      if (core) {
        this.core = core;
        clearInterval(timer);
        this.applyBestQuality();
        this.startMonitor();
      }
    }, 500);

    // 15초 후 타임아웃
    setTimeout(() => clearInterval(timer), 15000);
  }

  /**
   * DOM과 Vue 인스턴스를 탐색하여 PZP 플레이어 코어를 찾습니다.
   */
  private static findPlayerCore(): PlayerCore | null {
    const playerContainer =
      document.querySelector('[class*="live_player_"]') ||
      document.querySelector('[class*="player_container"]') ||
      document.querySelector(".pzp");

    if (!playerContainer) return null;

    const vue = (playerContainer as any).__vue__;
    if (vue) {
      if (typeof vue.getVideoTracksList === "function") return vue;
      if (vue.$children) {
        for (const child of vue.$children) {
          if (typeof child.getVideoTracksList === "function") return child;
        }
      }
    }

    return null;
  }

  /**
   * P2P(그리드) 트랙을 배제하고 가장 품질이 좋은 Non-P2P 1080p 트랙을 적용합니다.
   */
  public static applyBestQuality(targetHeight = 1080): boolean {
    if (!this.core) {
      this.core = this.findPlayerCore();
      if (!this.core) return false;
    }

    try {
      const rawTracks = this.core.getVideoTracksList();
      if (!rawTracks) return false;

      const tracks: VideoTrack[] = (Array.isArray(rawTracks) ? rawTracks : Object.values(rawTracks)).filter(
        (t) => t && typeof t.height === "number" && t.height > 0
      );

      if (tracks.length === 0) return false;

      // 1. 타겟 해상도(1080)와 일치하는 트랙들 검색
      const matchingTracks = tracks.filter((t) => t.height === targetHeight || Number(t.height) === targetHeight);
      let selectedTrack: VideoTrack | null = null;

      if (matchingTracks.length > 0) {
        // Non-P2P (BYPASS) 트랙 우선 선택 (P2P/grid가 포함되지 않은 것)
        selectedTrack =
          matchingTracks.find((t) => {
            const id = (t.id || "").toLowerCase();
            return !id.includes("p2p") && !id.includes("grid");
          }) || matchingTracks[0];
      } else {
        // 1080p가 없는 경우 가장 높은 해상도의 Non-P2P 트랙 선택
        const sorted = [...tracks].sort((a, b) => b.height - a.height);
        selectedTrack =
          sorted.find((t) => {
            const id = (t.id || "").toLowerCase();
            return !id.includes("p2p") && !id.includes("grid");
          }) || sorted[0];
      }

      if (selectedTrack) {
        this.core.setVideoTrack(selectedTrack);
        this.lastAppliedHeight = selectedTrack.height;
        console.info(`[ChzzkClean] 고화질 트랙 적용 완료: ${selectedTrack.label || selectedTrack.height + "p"} (ID: ${selectedTrack.id})`);
        return true;
      }
    } catch (e: any) {
      console.warn("[ChzzkClean] 화질 적용 중 예외 발생:", e.message);
    }

    return false;
  }

  /**
   * 화질이 멋대로 저화질로 떨어지는 것을 지속적으로 감시하고 1080p로 복구합니다.
   */
  private static startMonitor(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);

    this.monitorTimer = setInterval(() => {
      if (document.hidden) return;

      const video = document.querySelector("video");
      if (!video || video.paused) return;

      // 플레이어 코어 확인
      if (!this.core) {
        this.core = this.findPlayerCore();
      }

      if (this.core) {
        try {
          const rawTracks = this.core.getVideoTracksList();
          const current = (Array.isArray(rawTracks) ? rawTracks : Object.values(rawTracks)).find((t: any) => t?._selected);

          // 화질이 720p 미만으로 떨어졌거나 ABR로 풀렸을 경우 1080p 재적용
          if (current && current.height < 720) {
            console.warn(`[ChzzkClean] 저화질 감지됨 (${current.height}p) -> 1080p 재적용 시도`);
            this.applyBestQuality(1080);
          }
        } catch {}
      }
    }, 4000);
  }
}
