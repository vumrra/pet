# p.e.t 검증 결과

## 최종 상태
- 2026-09-21: 표시 이름, runtime app name, 창 제목, 메뉴, 트레이, 권한 안내, macOS bundle/executable, 설치 파일 이름을 `p.e.t`으로 변경.
- npm 내부 이름과 app ID, IPC namespace는 유지. app.setName 전에 기존 userData 경로를 보존하므로 이전 설정과 사용자 이미지를 그대로 사용.
- 사용자 제공 `11.png`, `22.png`을 기본 프레임으로 유지. 원본은 변경하지 않았으며 바깥 투명도와 내부 흰색을 보존.
- 환경: macOS 26.5.1 / Darwin 25.5.0, Apple Silicon arm64. Electron 41.10.7, electron-builder 26.15.3, uiohook-napi 1.5.5.

## 실행으로 확인
- 이름 변경 전 `app.getName() === "p.e.t"` 검사는 `pitter !== p.e.t`로 실패. 변경 후 패키징된 arm64 앱에서 통과.
- format:check, typecheck, unit tests 7개, build 통과.
- 최종 arm64 앱 smoke 14개 검사 통과, renderer 오류 0개. 실제 runtime 이름과 화면 제목 `p.e.t`도 검사.
- 기본 펫만 표시, 이미지 추가/오류/순서/삭제/5장 제한, IPC 검증, 설정 저장과 프로세스 재실행, 최소 너비420, reduced motion, 프레임/바운스/착지 확인.
- 최종 UI 캡처: `evidence/rename-after/settings-default.png`, `settings-five-images.png`, `settings-minimum.png`, `pet-idle.png`, `pet-active.png`. 실제 화면을 확인했으며 기본 두 이미지와 설정 UI 유지.
- `evidence/native-package-report.json`: 실제 우클릭으로 설정 열기, packaged native module 로드, unpacked permission executable 실행, 이미 허용된 권한의 preflight 및 hook ready 확인. 테스트 기간 activitySignals는 0개. 실제 타이핑 이벤트 수신을 입증한 결과는 아님. 시스템 권한은 변경하지 않음.
- `evidence/artifact-integrity.json`: 세 architecture target의 app.asar와 현재 dist/기본 이미지 일치, 맞는 native binary 포함, macOS helper 실행 권한 확인. ZIP 두 개의 CRC와 포함된 app.asar도 대조.
- 실제 산출물: macOS arm64 ZIP/DMG, macOS x64 ZIP/DMG, Windows x64 NSIS EXE. SHA-256은 `release/SHA256SUMS.txt`.
- 이전 Pitter 이름의 설치 파일은 `release/previous-pitter/`에 보관. 커밋, push, 외부 업로드 없음.

## 구분해야 하는 미검증 범위
- Windows 설치와 실제 키보드/DPI/tray 동작은 Windows 장비에서 미검증. EXE 생성 및 x64 payload 확인만 수행.
- p.e.t 이름 변경 후 Intel 앱은 빌드/내용만 검증하고 실행하지 않음. 사용자 Apple Silicon에서는 arm64 파일 사용.
- 실제 다른 앱 타이핑 중 focus/click-through, 물리적 모니터 간 drag, OS 권한 변경/취소, native hook crash recovery는 별도 수동 검증 필요.
- permission/listening 상태 스크린샷은 표시 상태 주입 테스트이며 실제 전역 입력 증거가 아님.
- 개발자 배포 서명/공증 없음. 보안 경고가 나타날 수 있음. 성능 수치 측정/공개 다운로드 URL은 제공하지 않음.
