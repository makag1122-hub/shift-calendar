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

const payload = sandbox.widgetApi.buildAndroidWidgetPayload(new Date(2026, 6, 29));
assert(payload.schema === 1, 'Android 위젯 데이터 스키마가 올바르지 않습니다.');
assert(payload.activeGroup === 'A', '기본 Android 위젯 조가 A조가 아닙니다.');
assert(payload.firstYear <= 2026 && payload.lastYear >= 2027, '2026·2027년 위젯 데이터가 모두 포함되지 않습니다.');
assert(payload.months['2026-08'].A.length === 31, '2026년 8월 A조 데이터가 31일이 아닙니다.');
assert(payload.months['2027-02'].D.length === 28, '2027년 2월 D조 데이터가 28일이 아닙니다.');

const august17 = payload.months['2026-08'].A[16];
assert(august17[1] === 'JG', '2026-08-17 A조 지근이 Android 위젯 데이터에 없습니다.');
assert(august17[2] === 7, '2026-08-17 A조 지근 번호가 Android 위젯 데이터와 다릅니다.');
assert(august17[4] === 1, '2026-08-17 대체공휴일 표시가 Android 위젯 데이터에 없습니다.');

const manifest = fs.readFileSync(
  path.join(ROOT, 'android-widget', 'app', 'src', 'main', 'AndroidManifest.xml'),
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

assert(manifest.includes('android.appwidget.action.APPWIDGET_UPDATE'), 'Android AppWidget 수신기가 등록되지 않았습니다.');
assert(provider.includes('ACTION_PREVIOUS') && provider.includes('ACTION_NEXT'), '위젯 월 이동 동작이 없습니다.');
assert(provider.includes('ACTION_GROUP'), '위젯 조 전환 동작이 없습니다.');
assert(renderer.includes('지근') && renderer.includes('지휴') && renderer.includes('특근'), '위젯 정산 태그 라벨이 빠졌습니다.');

console.log('Android 월간 달력 위젯 데이터 검사 통과');
