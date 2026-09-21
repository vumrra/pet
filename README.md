# p.e.t

키보드를 두드리면 움직이는 작은 데스크톱 펫입니다. macOS와 Windows용 Electron 앱이며, 서버·계정·분석·업데이트 서버를 사용하지 않습니다. 기본 캐릭터는 사용자가 제공한 `assets/default-1.png`, `assets/default-2.png`입니다. 두 원본의 투명도와 공통 캔버스 정렬을 유지합니다.

## 실행과 사용

앱을 열면 **펫만 나타납니다**. 펫을 드래그해서 옮기고, 우클릭하면 설정을 엽니다. 메뉴 막대/트레이에서도 설정과 종료를 선택할 수 있습니다. 펫은 항상 위에 표시되며 키보드 포커스를 가져가지 않습니다. 펫 바깥의 투명 영역은 클릭을 통과시킵니다.

설정에서 PNG·WebP·JPEG를 최대 5장 추가하고, 화살표로 순서를 바꾸거나 ×로 삭제합니다. 첫 사용자 이미지를 추가하면 기본 프레임 대신 사용자 이미지가 재생됩니다. 마지막 이미지를 삭제하거나 ‘기본 캐릭터로’를 누르면 기본 2장으로 돌아옵니다. 각 파일은 8 MB, 24 MP, 가로·세로 8192 px 이하이며 디코딩 확인 후 최대 768 px의 PNG 사본으로 앱 데이터에 저장됩니다. 원본 파일은 바꾸지 않습니다.

프레임 속도는 1–30 FPS, 펫 크기는 80–280 px입니다. 이미지가 한 장이어도 펫이 뛰며, 입력이 멈추면 착지한 뒤 첫 프레임으로 돌아옵니다. ‘키보드 입력에 반응하기’를 끄면 전역 연결도 종료됩니다. ‘움직여 보기’는 권한 없이 사용할 수 있습니다. 운영체제의 동작 줄이기를 켜면 바운스 없이 프레임만 바뀝니다.

## 로컬 설치 파일

설치 파일은 이 저장소의 `release/`에 생성했습니다. 별도 다운로드 사이트에 업로드하지 않았으며, 이 Mac에서는 아래 로컬 파일을 바로 열 수 있습니다. Windows로 옮길 때는 `.exe` 파일을 복사하면 됩니다.

Finder에서 설치 파일 폴더 열기:

```sh
open /Users/vumrra/project/etc/pet/release
```

| 대상 | 이 체크아웃의 파일 경로 |
| --- | --- |
| macOS Apple Silicon ZIP | `/Users/vumrra/project/etc/pet/release/p.e.t-1.0.0-mac-arm64.zip` |
| macOS Apple Silicon DMG | `/Users/vumrra/project/etc/pet/release/p.e.t-1.0.0-mac-arm64.dmg` |
| macOS Intel ZIP | `/Users/vumrra/project/etc/pet/release/p.e.t-1.0.0-mac-x64.zip` |
| macOS Intel DMG | `/Users/vumrra/project/etc/pet/release/p.e.t-1.0.0-mac-x64.dmg` |
| Windows x64 설치 프로그램 | `/Users/vumrra/project/etc/pet/release/p.e.t-1.0.0-win-x64.exe` |

다른 경로에 복제하면 저장소 루트만 달라집니다. 버전이 바뀌면 파일명 `1.0.0` 부분도 바뀝니다. macOS 실행 번들은 `release/mac-arm64/p.e.t.app` 또는 `release/mac/p.e.t.app`입니다. 내부 실행 파일은 `p.e.t.app/Contents/MacOS/p.e.t`입니다. Windows의 패키징 중간 결과는 `release/win-unpacked/p.e.t.exe`입니다.

macOS에서는 ZIP을 풀거나 DMG를 열고 `p.e.t.app`을 **응용 프로그램** 폴더에 복사한 뒤 실행하세요. Windows에서는 `.exe` 설치 프로그램에서 현재 사용자용 설치를 진행하세요. 자동 로그인 시작은 등록하지 않습니다.

macOS 로컬 빌드는 ad-hoc 서명이며 Developer ID 서명·공증은 없습니다. Windows 빌드는 서명되지 않았습니다. macOS Gatekeeper 또는 Windows SmartScreen 경고가 표시될 수 있습니다. 직접 빌드했거나 출처를 확인한 파일에 한해서 macOS의 시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기, Windows의 추가 정보 → 실행을 사용하세요. 시스템 보안 기능을 전체 해제할 필요는 없습니다. Windows 설치·전역 키보드 동작은 실제 Windows에서 확인하기 전까지 **미검증**입니다.

## 키보드 권한

macOS에서는 시스템 설정 → 개인정보 보호 및 보안의 **손쉬운 사용**과 **입력 모니터링**에서 p.e.t를 허용해야 합니다. 설정 화면에 각 패널로 이동하는 버튼과 ‘권한 다시 확인’이 있습니다. 개발 실행 시 목록의 이름이 Electron 또는 실행한 터미널로 표시될 수 있습니다. 권한 변경 뒤 재실행이 필요할 수 있으므로 최종 `.app`을 응용 프로그램 폴더에 둔 상태에서 허용하는 편이 좋습니다.

권한 확인은 요청 팝업을 띄우지 않는 사전 검사입니다. 권한이 없으면 네이티브 훅을 시작하지 않습니다. macOS는 자체 CFRunLoop를 사용하는 별도 CGEventTap 프로세스, Windows는 별도 utility process에서 입력을 감지합니다. 메인/렌더러에는 키 코드나 문자 대신 **활동 신호만** 전달하며 입력 내용을 기록·보관·전송하지 않습니다. 보안 입력 필드나 운영체제 제한 상황에서는 반응하지 않을 수 있습니다.

## 개발·빌드

Node.js 22.12 이상과 npm을 사용하세요. macOS 빌드에는 Xcode Command Line Tools의 clang이 필요합니다. 의존성 설치 및 Electron/빌더 도구 최초 다운로드 시 인터넷이 필요합니다. 앱 실행 중에는 외부 네트워크를 사용하지 않습니다.

```sh
npm ci --include=dev
npm run typecheck
npm test
npm run build
npm start
npm run smoke
npm run dist:mac
npm run dist:win
node scripts/verify-artifacts.mjs
```

`dist:mac`은 macOS 호스트에서 arm64/x64 ZIP·DMG를 생성합니다. `dist:win`은 Windows x64 NSIS 설치 프로그램을 생성하며 macOS 교차 빌드도 시도할 수 있습니다. `npmRebuild: false`로 `uiohook-napi`의 N-API 사전 빌드를 포함하고, 네이티브 모듈과 macOS 사전 검사 실행 파일은 ASAR 밖에 둡니다. 모든 패키징 명령은 `--publish never`를 사용합니다.

## 검증과 데이터

`npm test`는 모델·상한·모션·원자적 저장·실패 후 큐 복구를 검사합니다. `npm run smoke`는 실제 Electron을 Playwright로 실행하여 임시 프로필, 창 보안, PNG 가져오기/오류/최대 5장/재정렬/삭제, 설정 동시 저장, 실제 프로세스 재실행, 최소 너비, 동작 줄이기를 검사하고 `evidence/`에 스크린샷과 JSON 결과를 남깁니다. 권한/반응 중 스크린샷은 테스트 드라이버로 주입한 표시 상태이며 실제 권한 허용의 증거가 아닙니다.

자동화 모드는 `PITTER_TEST_MODE=1` **및** `--pitter-test-profile=<OS 임시 폴더 아래 pitter-e2e-* 디렉터리>`가 모두 필요합니다. 프로필 경로를 검증하며 네이티브 훅과 시스템 설정 열기를 막습니다. 일반 실행 실패 시 테스트 모드로 전환하는 경로는 없습니다. 스모크 테스트는 시스템 권한을 변경하지 않습니다. GUI 실행/디버깅이 금지된 샌드박스에서는 부모 터미널에서 실행해야 합니다.

패키징된 Apple Silicon 앱을 같은 안전 모드로 검사하려면 다음을 실행하세요.

```sh
PITTER_EXECUTABLE="$PWD/release/mac-arm64/p.e.t.app/Contents/MacOS/p.e.t" npm run smoke
```

이름 변경 전의 데이터 경로를 유지합니다. 일반 데이터 위치는 macOS `~/Library/Application Support/pitter/`, Windows `%APPDATA%/pitter/`입니다. `settings.json`과 `images/`에 저장합니다. 표시 이름만 `p.e.t`으로 바꿨으며 기존 이미지와 설정은 그대로 사용합니다. 변경은 큐로 직렬화하고 임시 파일을 쓴 뒤 rename으로 교체합니다. 손상된 설정은 자동 덮어쓰기 대신 경고를 표시하고 다음 저장 시 `settings.corrupt-*.json`으로 백업합니다. 앱을 종료한 상태에서 이 폴더를 백업하거나 초기화할 수 있습니다.
