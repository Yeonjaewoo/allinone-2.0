/**
 * 치지직 확장 프로그램 설정 인터페이스
 */
export interface UserSettings {
  enabled: boolean;
  gridBypassEnabled: boolean; // 그리드 우회 및 1080p 강제 고정
  autoAdSkip: boolean;        // 광고 감지 시 빈 응답 주입 및 자동 스킵
  autoDismissPopup: boolean;  // 광고차단 및 그리드 설치 유도 팝업 강제 제거
  preferredQuality: number | "ABR"; // 선호 화질 (1080, 720 등)
}

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  gridBypassEnabled: true,
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
