# 교대캘린더 🚒

삼성전자 소방대 **4조 3교대(DAY · SW · GY) 변형근무**를 위한 웹 캘린더입니다.
설치·서버 없이 `index.html` 파일 하나로 동작하며, 입력한 일정은 브라우저에 자동 저장됩니다.

## 기준

- 기준일: **2026년 6월 25일**
- 오늘 기준 배치: **GY A조 · SW D조 · DAY B조 · 휴무 C조**
- A조 패턴 기준: **2026년 6월 9일 = DAY 1일차**
- 따라서 2026년 6월 25일은 **A조 GY 4일차**로 표시됩니다.

## 공휴일 · 명절(설날·추석) 특별근무

- **공휴일 표시**: 달력 칸에 공휴일 이름(설날·추석·삼일절 등)이 빨간 글씨로 함께 표시됩니다. 우주항공청 월력요항과 현행 관공서공휴일규정에 맞춰 **2026·2027년 공휴일(노동절·제헌절 및 대체공휴일 포함)**이 반영돼 있습니다.
- **지근·지휴 자동 계산**: 주말뿐 아니라 평일 대체공휴일을 포함한 모든 공휴일 근무를 날짜순으로 지근 후보에 넣고, 평일 휴무와 1:1로 맞춥니다. 짝이 없는 나머지 휴일 근무는 특근으로 표시됩니다.
- **명절 특별근무**: 설날·추석에는 로테이션 전체가 재편성됩니다. **실제 회사 편성표(2026 추석: 9/10~10/12)**를 그대로 내장했고, 해당 기간은 칸 **위쪽 보라색 줄**로 표시됩니다.
  - 명절휴무 조를 커버하느라 **6일 연속근무(6근)**가 생기고, 휴무 겹치는 날(9/27)은 남은 두 조가 **DAY2/GY2 12시간 2교대**로 커버 — 전부 반영돼 있습니다.
  - 6일 이상 연속근무는 칸 **아래쪽 주황색 줄** + 날짜를 누르면 “🔺 6일 연속근무 (오늘 N일차)” 안내.
  - 추석을 지나며 로테이션이 6일 밀리는 것도 반영(`PATTERN_REANCHORS`, 2026-10-13부터 새 기준).
- 특정 날이 실제와 다르면 달력에서 그 날을 눌러 직접 바꿀 수 있고(수동 변경이 명절 편성보다 우선), ‘되돌리기’를 누르면 명절 편성 값으로 돌아옵니다.
- 다음 명절 편성이 나오면 `app.js`의 `SPECIAL_SCHEDULE`에 구간을 추가하고, 로테이션이 밀리면 `PATTERN_REANCHORS`에 새 기준일을 추가하면 됩니다.

## 실행 방법

- **가장 간단**: `index.html` 파일을 더블클릭 → 브라우저에서 바로 열림
- **휴대폰에서 쓰기(PWA 설치)**: 배포된 HTTPS 주소로 접속한 뒤 홈 화면에 추가합니다.
- **개발 중 확인**: 로컬 서버로 열어야 합니다. 예) 이 폴더에서
  ```
  python -m http.server 8000
  ```
  실행 후 PC 브라우저에서 `http://localhost:8000` 접속.

## 휴대폰 설치 방법

- **Android Chrome**: 배포 주소 접속 → 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**
- **iPhone Safari**: 배포 주소 접속 → 공유 버튼 → **홈 화면에 추가**
- 설치 후에는 홈 화면 아이콘으로 열리며, 브라우저 주소창 없이 앱처럼 표시됩니다.
- 일정 데이터는 브라우저/기기별로 저장됩니다. 홈 화면 앱에서 데이터가 안 보이면 **설정 → 백업 내보내기/불러오기**를 사용하세요.

## Android 홈 화면 위젯

앱을 열지 않고 홈 화면에서 바로 월간 달력을 보는 Android 위젯입니다. (`android-widget/`)

**설치**

1. [최신 릴리스](https://github.com/makag1122-hub/shift-calendar/releases/latest)에서 `shift-calendar-widget.apk`를 폰 브라우저로 내려받습니다.
2. 다운로드한 파일을 눌러 설치합니다. 처음에는 **'알 수 없는 앱 설치'** 허용을 물어보니 허용해 주세요.
3. **앱을 한 번 엽니다.** 이때 달력 데이터가 폰에 저장됩니다. (이 과정을 건너뛰면 위젯이 비어 보입니다)
4. 앱 안에서 **내 조(A/B/C/D)를 선택**합니다.
5. 홈 화면 빈 곳을 길게 누르고 **위젯 → 교대캘린더**를 홈 화면에 올립니다.

> **내 수정 내역 옮기기** — 이 앱은 Chrome/PWA와 저장 공간이 분리돼 있어, 근무 패턴·공휴일·명절 편성은 그대로 나오지만 **직접 바꾼 날(빨간 점)과 메모는 따라오지 않습니다.** 기존 PWA에서 **설정 → 백업 내보내기**로 JSON을 저장한 뒤, 이 앱에서 **설정 → 백업 불러오기**로 한 번 넣어주면 됩니다.

**위젯에서 할 수 있는 것**

- 월 이동(◀ ▶), 오늘로 이동, A/B/C/D 조 전환
- `4개조` 버튼으로 A/B/C/D 월간 근무를 네 줄로 비교
- 근무 색상, 지근·지휴·특근 태그, 공휴일, 메모 표시
- 30분마다 자동 갱신

**업데이트**

- **달력 내용**(근무 패턴, 공휴일, 명절 편성, 색상)은 앱이 웹사이트를 그대로 불러오는 구조라 **앱을 열 때마다 자동으로 최신**이 됩니다. APK를 다시 받을 필요가 없습니다.
- **Google Play 설치판**은 앱을 열 때 새 버전을 확인하고 안내 팝업에서 Play 스토어로 이동합니다. 외부 APK 설치 권한은 들어가지 않습니다.
- **GitHub 직접 설치판**은 위젯 화면 자체가 바뀐 경우 앱 안의 **새 버전 안내창**에서 새 APK를 받을 수 있습니다.
- 새 버전 판단 기준은 사이트 루트의 [`widget-version.json`](widget-version.json)이며, 여기 적힌 `versionCode`·`versionName`은 `android-widget/app/build.gradle`과 일치해야 합니다. (어긋나면 `tests/verify-android-widget.js`가 실패합니다)

**빌드·배포** — GitHub Actions에서 서명까지 자동으로 처리합니다.

- 코드만 검증: `android-widget/**` 변경을 main에 push
- 릴리스 발행: Actions → *Android calendar widget* → **Run workflow** → `release_version`에 `1.1.0` 같은 버전 입력
- Actions 산출물 `shift-calendar-play.aab`: Google Play Console 업로드용
- Actions 산출물 `shift-calendar-widget.apk`: GitHub 직접 설치용
- Play 배포판은 Android 16(API 36)을 대상으로 하며, 직접 설치판에만 `REQUEST_INSTALL_PACKAGES` 권한이 포함됩니다.

## 사용법

1. **오늘 근무 확인** — 맨 위 배너에 오늘 근무와 시간이 표시됩니다.
2. **내 조 선택** — A조/B조/C조/D조 버튼을 누르면 오늘 배너와 달력이 선택한 조 기준으로 바뀝니다.
3. **조별 한눈보기** — 오늘 A/B/C/D 각 조가 DAY/SW/GY/휴무 중 어디에 있는지 한 번에 볼 수 있습니다.
4. **날짜 탭** — 달력에서 날짜를 누르면 선택한 조 기준으로 그날 근무(주간/스윙/야간/휴무)를 바꾸거나 메모를 남길 수 있습니다.
   - 패턴과 다르게 바꾼 날은 빨간 점(수동 변경) 표시
   - 메모가 있는 날은 노란 점 표시
5. **설정(⚙)**
   - **근무 종류·시간·색상**: 본인 근무표에 맞게 시간과 색을 조정
   - **반복 패턴**: 한 주기를 순서대로 만들면 자동 반복 적용 (변형되는 날은 달력에서 개별 수정)
   - **패턴 시작일**: 패턴의 첫 번째 근무가 적용되는 기준 날짜
   - **수동 변경을 기본으로 확정**: 달력에서 직접 바꾼 날(우측 상단 **빨간 네모** 표시)을 현재 조의 **기본 근무표로 굳혀** 빨간 표시를 없앱니다. 값은 그대로 유지되고 공유 화면에도 깔끔하게 반영됩니다. 확정 후 다시 바꾸면 빨간 네모가 다시 생기고, 언제든 재확정할 수 있어요. (확정값은 패턴·명절 편성보다 우선)
   - **데이터**: 백업 내보내기 / 불러오기 / 초기화

## 친구와 공유하기 (실시간 동기화)

내 근무표를 친구와 공유할 수 있습니다. **내가 수정하면 친구 화면에 자동 반영**되고, 친구는 근무표를 보면서 **날짜별 메모를 함께 작성**할 수 있습니다.

- **사용자 흐름**: `설정(⚙) → 친구와 공유하기 → 공유방 만들기 → 카카오톡으로 친구 초대`로 끝납니다. 사용자는 Firebase 설정을 하지 않습니다.
- **운영자 1회 설정**: 무료 [Firebase Firestore](https://firebase.google.com) 프로젝트를 하나 만들고 Authentication에서 **익명 로그인**을 켠 뒤, 웹 앱의 `firebaseConfig`를 [`sync-config.js`](sync-config.js)에 넣어 배포합니다. 이 값은 Firebase 프로젝트의 공개 식별자이며 비밀번호가 아닙니다.
- **Firestore 보안 규칙**: [`firestore.rules`](firestore.rules) 파일과 같은 내용을 규칙 탭에 게시합니다.
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /calendars/{code} {
        function signedIn() {
          return request.auth != null;
        }
        function isOwner() {
          return signedIn() && resource.data.ownerUid == request.auth.uid;
        }
        function isMember() {
          return signedIn() && request.auth.uid in resource.data.memberUids;
        }
        allow create: if signedIn()
          && code.matches('^[a-z2-9]{20}$')
          && request.resource.data.ownerUid == request.auth.uid
          && request.resource.data.memberUids == [request.auth.uid];
        allow read: if isOwner() || isMember();
        allow update: if
          (isOwner()
            && request.resource.data.ownerUid == resource.data.ownerUid
            && request.resource.data.memberUids == resource.data.memberUids)
          || (signedIn()
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberUids'])
            && request.resource.data.memberUids.hasAll(resource.data.memberUids)
            && request.resource.data.memberUids.size() <= resource.data.memberUids.size() + 1
            && request.resource.data.memberUids.size() <= 10
            && request.auth.uid in request.resource.data.memberUids)
          || (isMember()
            && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['sharedMemos', 'memoUpdatedAt']));
        allow delete: if isOwner();
      }
    }
  }
  ```
- **공유하기**: 공유 링크를 친구가 열면 근무표가 실시간으로 표시됩니다. 근무·태그·패턴은 소유자만 바꿀 수 있고 메모는 두 사람 모두 작성할 수 있습니다.
  - **카카오톡 초대**: Android 앱에서는 카카오톡을 바로 열고, 카카오톡이 없으면 기본 공유창을 엽니다. PWA에서는 기기의 공유창을 사용합니다.
  - **QR 코드**: 옆에 있으면 화면의 QR 코드를 친구 폰 카메라로 스캔하면 됩니다. QR은 외부 서버 없이 오프라인에서 직접 생성합니다(`qrcode.js`).
- **최신 상태 표시**: 보는 사람 화면에는 **‘방금 전 / N분 전 업데이트됨’** 배지가 표시돼, 지금 보는 근무표가 최신인지 한눈에 알 수 있습니다.
- 근무표 데이터는 **소유자 → 상대방**으로 전달되고, 날짜별 메모는 **양방향**으로 동기화됩니다. 메모만 별도 필드로 저장하므로 상대방의 메모 작성이 근무표를 덮어쓰지 않습니다.

## 데이터 보관

- 데이터는 **이 브라우저에만** 저장됩니다(localStorage).
- 기기를 바꾸거나 브라우저 데이터를 지우기 전에는 **설정 → 백업 내보내기**로 JSON 파일을 보관하세요.

## 기술

- 순수 HTML / CSS / JavaScript (의존성·빌드 없음)
- PWA 지원: `manifest.json` · `service-worker.js` · `icons/`
- 실시간 공유: `sync-config.js` · `sync.js`(Firebase Firestore) · 오프라인 QR 생성: `qrcode.js`
- `index.html` · `style.css` · `app.js` · `sync-config.js` · `sync.js` · `qrcode.js` · `manifest.json`

---
🤖 만든이: Claude
