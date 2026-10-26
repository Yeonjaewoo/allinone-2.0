/**
 * 치지직 확장 프로그램 설정 인터페이스
 */
export interface UserSettings {
  enabled: boolean;
  gridBypassEnabled: boolean;  // 그리드 우회 및 1080p 강제 고정
  lowLatencyMode: boolean;     // 저지연 모드 (실시간 딜레이 최소화)
  targetLatency: number;       // 목표 지연시간 (초 단위: 1.0 ~ 5.0)
  chatLatencyDisplay: boolean; // 입력창 실시간 지연시간/버퍼 표시
  autoAdSkip: boolean;         // 광고 감지 시 빈 응답 주입 및 자동 스킵
  autoDismissPopup: boolean;   // 광고차단 및 그리드 설치 유도 팝업 강제 제거
  preferredQuality: number | "ABR"; // 선호 화질 (1080, 720 등)
}

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  gridBypassEnabled: true,
  lowLatencyMode: true,
  targetLatency: 2.0,
  chatLatencyDisplay: true,
  autoAdSkip: true,
  autoDismissPopup: true,
  preferredQuality: 1080,
};

/**
 * 치지직 PZP 플레이어 비디오 트랙 인터페이스
 */
export interface VideoTrack {
  id: string;
  label: string;
  height: number;
  videoBitrate?: number;
  _selected?: boolean;
}

/**
 * PZP 플레이어 코어 인터페이스
 */
export interface PlayerCore {
  getVideoTracksList: () => VideoTrack[] | Record<string, VideoTrack>;
  setVideoTrack: (track: VideoTrack) => void;
  getAudioTracksList?: () => any[];
}
