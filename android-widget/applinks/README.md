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

## 2. 지문(SHA-256)

[`.well-known/assetlinks.json`](../../.well-known/assetlinks.json)에는 지문이 두 개 필요합니다.

**직접 배포 APK 서명키 — ✅ 이미 등록됨**

```
55:82:03:91:B2:E6:D1:02:A2:71:0B:AE:0F:6E:D8:2A:73:34:99:68:3C:06:48:5D:0B:8A:46:38:B5:07:B6:22
```

CI가 만든 서명 APK의 APK Signing Block(v2)에서 인증서를 꺼내 계산했고,
`openssl x509 -fingerprint -sha256` 으로 교차 확인했습니다
(`O=Personal, CN=Shift Calendar Widget`, 2026-07-28 ~ 2056-07-29).
로컬에 키스토어가 없어도 같은 방법으로 다시 뽑을 수 있습니다.

**Play 앱 서명 키 — ⬜ 아직 필요**
Play는 업로드한 AAB를 **구글 키로 다시 서명**하므로, 스토어 설치본은 위 지문과 다릅니다.
Play Console > 앱 > 테스트 및 출시 > 설정 > **앱 서명** >
"앱 서명 키 인증서"의 SHA-256을 복사해 배열에 한 줄 더 넣으세요.
(같은 화면의 딥 링크 섹션에서 완성된 JSON을 통째로 복사해도 됩니다.)

> **자리표시자 문자열을 넣어 두지 마세요.** 형식이 어긋난 값이 하나라도 있으면
> Google 검증기가 이 파일을 통째로 거부합니다. 모르는 지문은 아예 빼 두는 편이 낫습니다.
> `tests/verify-hosting.js` 가 형식과 누락을 검사합니다.
>
> 옆 프로젝트 `Light_weight_baby/public/.well-known/assetlinks.json` 이
> 지문 두 개를 다 채워 넣은 실제 예시입니다.

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
