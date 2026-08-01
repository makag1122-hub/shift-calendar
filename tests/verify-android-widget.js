'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const startCall = appSource.lastIndexOf('renderWeekdays();');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

assert(startCall >= 0, 'app.js 시작 지점을 찾지 못했습니다.');

const sandbox = {
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
  console,
  Date,
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
};

vm.runInNewContext(
  appSource.slice(0, startCall) + `
    globalThis.widgetApi = { buildAndroidWidgetPayload, state };
  `,
  sandbox
);

sandbox.widgetApi.state.groupMemos.A['2026-08-17'] = '인수인계 확인';
const payload = sandbox.widgetApi.buildAndroidWidgetPayload(new Date(2026, 6, 29));
assert(payload.schema === 2, 'Android 위젯 메모 데이터 스키마가 올바르지 않습니다.');
assert(payload.activeGroup === 'A', '기본 Android 위젯 조가 A조가 아닙니다.');
assert(payload.firstYear <= 2026 && payload.lastYear >= 2027, '2026·2027년 위젯 데이터가 모두 포함되지 않습니다.');
assert(payload.months['2026-08'].A.length === 31, '2026년 8월 A조 데이터가 31일이 아닙니다.');
assert(payload.months['2027-02'].D.length === 28, '2027년 2월 D조 데이터가 28일이 아닙니다.');

const august17 = payload.months['2026-08'].A[16];
assert(august17[1] === 'JG', '2026-08-17 A조 지근이 Android 위젯 데이터에 없습니다.');
assert(august17[2] === 7, '2026-08-17 A조 지근 번호가 Android 위젯 데이터와 다릅니다.');
assert(august17[3] === '인수인계 확인', '날짜별 메모 본문이 Android 위젯 데이터에 없습니다.');
assert(august17[4] === 1, '2026-08-17 대체공휴일 표시가 Android 위젯 데이터에 없습니다.');

const manifest = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8'
);
const directManifest = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'direct', 'AndroidManifest.xml'),
  'utf8'
);
const provider = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'CalendarWidgetProvider.java'),
  'utf8'
);
const renderer = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'CalendarWidgetRenderer.java'),
  'utf8'
);
const widgetLayout = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'res', 'layout', 'widget_calendar.xml'),
  'utf8'
);
const weekProvider = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'FourGroupWeekWidgetProvider.java'),
  'utf8'
);
const weekWidgetLayout = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'res', 'layout', 'widget_four_groups_week.xml'),
  'utf8'
);

assert(manifest.includes('android.appwidget.action.APPWIDGET_UPDATE'), 'Android AppWidget 수신기가 등록되지 않았습니다.');
assert(provider.includes('ACTION_PREVIOUS') && provider.includes('ACTION_NEXT'), '위젯 월 이동 동작이 없습니다.');
assert(provider.includes('ACTION_GROUP'), '위젯 조 전환 동작이 없습니다.');
assert(widgetLayout.includes('@+id/widget_group'), '위젯에 조 전환 칩이 없습니다.');
assert(renderer.includes('지근') && renderer.includes('지휴') && renderer.includes('특근'), '위젯 정산 태그 라벨이 빠졌습니다.');
assert(renderer.includes('Bitmap.Config.ARGB_8888'), '위젯이 고화질 ARGB 비트맵을 사용하지 않습니다.');
assert(renderer.includes('RENDER_SCALE = 2.5f'), '위젯의 고해상도 렌더링이 빠졌습니다.');
assert(renderer.includes('memoText(entry)'), '위젯의 날짜별 메모 표시가 빠졌습니다.');
assert(renderer.includes('drawAllGroups('), '위젯의 A/B/C/D 4행 비교 렌더링이 없습니다.');
assert(renderer.includes('renderWeek('), '4개 조 주간 위젯 렌더링이 없습니다.');
assert(renderer.includes('drawWeekGroups('), '4개 조 주간 4행 비교 렌더링이 없습니다.');
assert(renderer.includes('calendarHeight('), '위젯 크기에 맞춘 달력 비율 계산이 없습니다.');
assert(renderer.includes('drawTag('), '앱과 같은 정산 태그 배지가 위젯에 없습니다.');
assert(provider.includes('OPTION_APPWIDGET_MIN_WIDTH'), '위젯 너비에 맞춘 렌더링이 없습니다.');
assert(provider.includes('OPTION_APPWIDGET_MIN_HEIGHT'), '위젯 높이에 맞춘 렌더링이 없습니다.');
assert(manifest.includes('.FourGroupWeekWidgetProvider'), '4개 조 주간 위젯이 매니페스트에 없습니다.');
assert(weekProvider.includes('WEEK_PREVIOUS') && weekProvider.includes('WEEK_NEXT'), '주간 위젯의 주 이동 동작이 없습니다.');
assert(weekProvider.includes('Calendar.WEEK_OF_YEAR'), '주간 위젯이 7일 단위로 이동하지 않습니다.');
assert(weekWidgetLayout.includes('@+id/week_widget_image'), '4개 조 주간 위젯 레이아웃이 없습니다.');

/* ---------- 앱 내 업데이트 확인 ----------
   widget-version.json은 설치된 앱이 새 버전을 판단하는 기준입니다.
   build.gradle과 어긋나면 업데이트 안내가 안 뜨거나 무한 반복되므로 여기서 막습니다. */
const buildGradle = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'build.gradle'),
  'utf8'
);
const gradleProperties = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'gradle.properties'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.join(ROOT, '.github', 'workflows', 'android-widget.yml'),
  'utf8'
);
const mainActivity = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'MainActivity.java'),
  'utf8'
);
const kakaoShareManager = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'KakaoShareManager.java'),
  'utf8'
);
const shiftCalendarApplication = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'ShiftCalendarApplication.java'),
  'utf8'
);
const updateChecker = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'java', 'kr', 'co', 'shiftcalendar', 'widget', 'UpdateChecker.java'),
  'utf8'
);
const versionFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'widget-version.json'), 'utf8'));

const gradleVersionCode = Number((buildGradle.match(/versionCode\s+(\d+)/) || [])[1]);
const gradleVersionName = (buildGradle.match(/versionName\s+'([^']+)'/) || [])[1];

assert(Number.isInteger(gradleVersionCode), 'build.gradle에서 versionCode를 읽지 못했습니다.');
assert(
  versionFile.versionCode === gradleVersionCode,
  `widget-version.json versionCode(${versionFile.versionCode})가 build.gradle(${gradleVersionCode})과 다릅니다.`
);
assert(
  versionFile.versionName === gradleVersionName,
  `widget-version.json versionName(${versionFile.versionName})이 build.gradle(${gradleVersionName})과 다릅니다.`
);
assert(/compileSdk\s+36/.test(buildGradle), 'Android 16 compileSdk 36이 설정되지 않았습니다.');
assert(/targetSdk\s+36/.test(buildGradle), 'Google Play용 targetSdk 36이 설정되지 않았습니다.');
assert(buildGradle.includes('play {') && buildGradle.includes('direct {'), 'Play·직접 배포 빌드가 분리되지 않았습니다.');
assert(workflow.includes('bundlePlayRelease'), 'Google Play AAB 빌드 작업이 없습니다.');
assert(
  versionFile.apkUrl === 'https://github.com/makag1122-hub/shift-calendar/releases/latest/download/shift-calendar-widget.apk',
  'widget-version.json의 apkUrl이 최신 릴리스 주소가 아닙니다.'
);

assert(!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'Play 공용 매니페스트에 외부 앱 설치 권한이 남아 있습니다.');
assert(directManifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'), '직접 배포판의 업데이트 설치 권한이 없습니다.');
assert(mainActivity.includes('BuildConfig.SELF_UPDATE_ENABLED'), '배포 방식별 업데이트 확인 분기가 없습니다.');
assert(updateChecker.includes('widget-version.json'), 'UpdateChecker가 버전 파일을 바라보지 않습니다.');
assert(mainActivity.includes('market://details?id='), 'Play 설치판을 Play 스토어 업데이트로 연결하지 않습니다.');
assert(mainActivity.includes('checkForUpdate();'), '앱 시작 시 업데이트 확인이 실행되지 않습니다.');
assert(!mainActivity.includes('KEY_SKIPPED_VERSION'), '나중에 선택이 업데이트 버전을 영구히 숨기고 있습니다.');
assert(mainActivity.includes('WindowInsets.Builder'), '상태바 안전 영역을 WebView 앞에서 소비하지 않습니다.');
assert(mainActivity.includes('requestApplyInsets'), '첫 화면의 상태바 안전 영역 갱신 요청이 없습니다.');
assert(manifest.includes('@drawable/ic_launcher_v3'), '새 런처 아이콘이 Android 앱에 연결되지 않았습니다.');

/* ---------- 백업 불러오기·내보내기 ----------
   WebView는 파일 선택창과 blob: 다운로드를 기본으로 처리하지 못합니다.
   둘 중 하나라도 빠지면 설정 화면의 버튼이 눌러도 무반응이 됩니다. */
assert(mainActivity.includes('onShowFileChooser'), '백업 불러오기용 파일 선택창 처리가 없습니다.');
assert(mainActivity.includes('onActivityResult'), '파일 선택 결과를 WebView로 돌려주지 않습니다.');
assert(mainActivity.includes('public void saveBackup('), '백업 내보내기 브리지가 없습니다.');
assert(
  appSource.includes("typeof bridge.saveBackup === 'function'"),
  'app.js가 Android 백업 저장 브리지를 사용하지 않습니다.'
);

/* ---------- 카카오톡 친구 초대 ---------- */
assert(mainActivity.includes('public void shareToKakao('), '카카오톡 공유 브리지가 없습니다.');
assert(mainActivity.includes('com.kakao.talk'), '카카오톡 앱을 직접 여는 패키지 연결이 없습니다.');
assert(manifest.includes('android:scheme="shiftcalendar"'), '친구 초대 앱 딥링크 스킴이 없습니다.');
assert(manifest.includes('android:host="share"'), '친구 초대 앱 딥링크 주소가 없습니다.');
assert(mainActivity.includes('shareToken('), '공유 토큰을 앱으로 전달하는 처리가 없습니다.');
assert(mainActivity.includes('shiftcalendar'), '카카오톡 공유가 앱 딥링크를 만들지 않습니다.');
assert(mainActivity.includes('onNewIntent('), '실행 중인 앱에서 친구 초대 링크를 받지 못합니다.');
assert(buildGradle.includes("com.kakao.sdk:v2-share:2.24.0"), '카카오톡 공식 공유 SDK가 연결되지 않았습니다.');
assert(gradleProperties.includes('android.useAndroidX=true'), '카카오 SDK의 AndroidX 사용 설정이 없습니다.');
assert(shiftCalendarApplication.includes('KakaoSdk.init('), '카카오 SDK 초기화가 없습니다.');
assert(manifest.includes('android:name=".ShiftCalendarApplication"'), '카카오 SDK Application이 매니페스트에 없습니다.');
assert(manifest.includes('android:scheme="kakaoe9f15b01b136223f0f0d7b2e00b94281"'), '카카오 앱 실행 스킴이 없습니다.');
assert(manifest.includes('android:host="kakaolink"'), '카카오 앱 실행 호스트가 없습니다.');
assert(kakaoShareManager.includes('ShareClient.getInstance().shareDefault('), '카카오톡 공식 기본 템플릿 공유가 없습니다.');
assert(kakaoShareManager.includes('androidExecutionParams') || kakaoShareManager.includes('executionParams'), '카카오 앱 실행 토큰 전달이 없습니다.');
assert(kakaoShareManager.includes('교대캘린더에서 열기'), '카카오톡 공유 카드의 앱 열기 버튼이 없습니다.');
assert(
  appSource.includes("typeof bridge.shareToKakao === 'function'"),
  'app.js가 Android 카카오톡 공유 브리지를 사용하지 않습니다.'
);

console.log('Android 월간 달력 위젯 데이터 검사 통과');
console.log(`업데이트 버전 정보 일치: ${gradleVersionName} (versionCode ${gradleVersionCode})`);
