# 치지직 클린 (Chzzk Clean) 프로젝트 가이드

## 프로젝트 개요
- 치지직(CHZZK) 전용 초경량 순수 TypeScript 기반 크롬 확장프로그램 (Manifest V3)
- Vite + TypeScript 번들링 환경
- 목적: 동영상 광고 차단(안티 애드블록 무력화), 그리드(P2P) 우회 및 1080p 고화질 고정, 방해 팝업 자동 닫기

## 디렉토리 구조 및 역할
- `src/injected/`: 웹페이지 메인 컨텍스트에 직접 주입되어 동작하는 핵심 엔진
  - `ad-interceptor.ts`: 네이버 Veta 광고 스케줄(GFP, Waterfall) 및 OPTIONS 프리플라이트 가로채기 (안티 애드블록 우회)
  - `grid-bypass.ts`: PZP 플레이어 인스턴스 후킹, Non-P2P 1080p 트랙 우선 선택 및 저화질 감시/복구
  - `popup-dismiss.ts`: MutationObserver 기반 광고차단/그리드 모달 감지 즉시 숨김 및 자동 재생 복구
- `src/content/`: `injected.js`를 웹페이지에 주입하는 컨텐트 스크립트
- `src/background/`: 확장프로그램 초기화 및 스토리지 관리 서비스 워커
- `src/popup/`: 심플한 다크 테마 설정 UI
- `src/types/`: 엄격한 TypeScript 타입 정의

## 빌드 및 검증 원칙
1. 코드 수정 후 반드시 `npm run build`를 실행하여 TypeScript 타입 에러가 없는지 검증한다.
2. 빌드 산출물(`dist/`)을 크롬의 '압축해제된 확장 프로그램'으로 로드하여 사용한다.
