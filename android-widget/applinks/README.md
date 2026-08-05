# 초대 링크를 앱으로 열기 (Android App Links)

초대 링크는 `https://gyodae-calendar.web.app/#share=...` 입니다.
이 주소는 **앱 화면의 주소**일 뿐이고, 근무표 동기화는 Firestore로 앱 ↔ 앱 직접 연결됩니다.
Firebase Hosting은 HTML/JS만 내려줍니다. (Hosting과 Firestore가 같은 `gyodae-calendar` 프로젝트입니다.)

안드로이드는 **`assetlinks.json`으로 소유권을 증명한 주소만** 앱으로 바로 열어 줍니다.
이 파일을 올리기 전까지는, 앱이 깔려 있어도 초대 링크가 브라우저로 열립니다.
(카카오톡 초대 카드는 카카오 실행 파라미터를 쓰므로 지금도 앱으로 열립니다.)

## 1. 파일 위치 — 이미 준비돼 있습니다

`assetlinks.json`은 **도메인 최상위**에 있어야 합니다. 하위 경로는 인정되지 않습니다.
Firebase Hosting은 저장소 루트의 `.well-known/` 을 그대로 최상위에 서빙하므로,
GitHub Pages를 쓸 때처럼 별도 저장소를 만들 필요가 없습니다.

```
저장소의  .well-known/assetlinks.json
   → https://gyodae-calendar.web.app/.well-known/assetlinks.json
   → https://gyodae-calendar.firebaseapp.com/.well-known/assetlinks.json
```

`firebase.json`에 이 파일을 `application/json`으로 내려주는 헤더도 넣어 뒀습니다.

## 2. 지문(SHA-256) 채우기 — 여기가 남은 작업

[`.well-known/assetlinks.json`](../../.well-known/assetlinks.json)의 자리표시자 두 개를
실제 인증서 지문으로 바꿉니다.

**Play 스토어 설치본** (필수)
Play Console > 앱 > 테스트 및 출시 > 설정 > **앱 서명** >
"앱 서명 키 인증서"의 SHA-256 인증서 지문을 복사합니다.
(Play Console의 딥 링크 화면에서 완성된 JSON을 그대로 복사할 수도 있습니다.)

**직접 배포 APK** (GitHub 릴리스로 받은 APK도 앱으로 열리게 하려면)

```bash
keytool -list -v -keystore shift-calendar.p12 -storetype PKCS12 -alias <ALIAS>
```

출력의 `SHA256:` 줄을 씁니다. `AB:CD:...` 형식 그대로 넣으면 됩니다.
둘 중 하나만 쓸 거라면 나머지 한 줄은 지웁니다.

> 옆 프로젝트 `Light_weight_baby/public/.well-known/assetlinks.json` 이
> 지문 두 개를 채워 넣은 실제 예시입니다.

## 3. 배포하고 확인

```bash
npx firebase deploy --only hosting
```

브라우저에서 `https://gyodae-calendar.web.app/.well-known/assetlinks.json` 이
그대로 보이는지 확인한 뒤, 앱을 새로 설치하고:

```bash
adb shell pm get-app-links kr.co.shiftcalendar.widget
```

`gyodae-calendar.web.app: verified` 가 나오면 성공입니다.

검증이 실패해도 사용자가 직접 켤 수 있습니다:
설정 > 앱 > 교대캘린더 > 기본으로 열기 > "지원되는 링크 열기" 켜기.

## 예전 GitHub Pages 주소

이미 보낸 초대 링크(`makag1122-hub.github.io/shift-calendar/#share=...`)를 위해
매니페스트에 필터를 남겨 뒀지만, **`autoVerify`는 일부러 넣지 않았습니다.**
Android 11 이하는 App Links 검증이 앱 전체 단위라, assetlinks.json이 없는 호스트를
함께 검증시키면 위의 Firebase 호스트까지 같이 실패하기 때문입니다.
옛 링크는 브라우저로 열리는데, 같은 웹 화면이라 공유는 그대로 동작합니다.
