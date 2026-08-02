'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sync = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

assert(!app.includes('class="cell-hol"'), '달력 카드에 공휴일명이 다시 표시되고 있습니다.');
assert(
  app.includes('${DESIG[ti.tag].short}</span>'),
  '달력 카드의 정산 태그가 지근·지휴·특근 공통 라벨이 아닙니다.'
);
assert(
  app.includes('<span class="cell-top"><span class="dnum ${dnumCls}">${d}</span>${tagHtml}</span>'),
  '날짜 오른쪽 정산 태그 구조가 변경됐습니다.'
);
assert(
  app.includes('<span class="sh-hol">🔴 ${escapeHtml(hol)}</span>'),
  '날짜 상세창에서 공휴일명을 확인할 수 없습니다.'
);
assert(
  css.includes('grid-template-columns:auto minmax(0,1fr) auto;'),
  '날짜·정산 태그의 고정 행 구조가 없습니다.'
);
assert(
  !css.includes('border-left:2px solid rgba(182,107,22,.58)'),
  '달력 메모에 장식성 세로선이 다시 생겼습니다.'
);
assert(
  !css.includes('box-shadow:inset 3px 0 0 #4d9b8f'),
  '공동 메모 입력창에 장식성 세로선이 다시 생겼습니다.'
);
assert(
  index.includes('data-calendar-view="all"') && index.includes('id="allGroupsGrid"'),
  '4개 조 한눈에 보기의 화면 구조가 없습니다.'
);
assert(
  app.includes('function renderAllGroupsCalendar()') && app.includes('GROUPS.map(group=>'),
  'A/B/C/D 4행 가로 비교표 렌더링이 없습니다.'
);
assert(
  !index.includes('id="groupTabs"') && !index.includes('id="todayBanner"'),
  '앱 상단에 중복된 내 조 선택 또는 오늘 근무 영역이 남아 있습니다.'
);
assert(
  index.includes('id="teamBoard"') && app.includes("$('teamBoard').addEventListener"),
  'A/B/C/D 오늘 배치에서 조를 선택하는 기능이 없습니다.'
);
assert(
  css.includes('grid-template-rows:28px repeat(4, 68px);'),
  '4개 조 비교표가 정확히 네 행으로 고정되지 않았습니다.'
);
assert(
  app.includes('<b>오늘 · ${todayLabel}</b>'),
  'A/B/C/D 오늘 배치 머리글에 오늘 날짜가 없습니다.'
);
assert(
  app.includes('<span class="team-time">${escapeHtml(timeText(t))}</span>'),
  '선택한 조 카드에 오늘 근무 시간이 없습니다.'
);
assert(
  !app.includes('<b>${BASE_DATE} 기준</b>'),
  '오늘 배치 머리글에 과거 기준일이 남아 있습니다.'
);
assert(!css.includes('.today-banner') && !css.includes('.tb-time'), '삭제된 오늘 배너 CSS가 남아 있습니다.');
assert(index.includes('ver 2026.08.03'), '화면 버전 날짜가 2026.08.03으로 갱신되지 않았습니다.');
assert(!index.includes('ver 2026.07.31.3'), '화면에 이전 버전 날짜가 남아 있습니다.');

/* ---------- 공유방 이름: 카카오 로그인 대신 직접 입력 ---------- */
assert(
  app.includes('id="syncNameInput"') && app.includes('id="syncNameSave"'),
  '공유방에 표시할 이름을 직접 입력하는 칸이 없습니다.'
);
assert(app.includes('function saveDisplayName('), '입력한 이름을 저장하는 처리가 없습니다.');
assert(
  !app.includes('kakaoIdentity') && !app.includes('btn-kakao-login'),
  '카카오 로그인 카드가 앱 화면에 아직 남아 있습니다.'
);
assert(
  !css.includes('.kakao-login-card') && !css.includes('.kakao-identity'),
  '카카오 로그인 카드 CSS가 남아 있습니다.'
);
assert(css.includes('.name-card'), '이름 입력 카드 스타일이 없습니다.');
assert(
  app.includes('typeof bridge.shareToKakao') && css.includes('.kakao-mark'),
  '카카오톡 초대 공유 기능이 사라졌습니다.'
);
assert(
  sync.includes("PROFILE_KEY = 'shiftcal.profile'") && sync.includes('saveProfileName('),
  '입력한 이름이 기기에 저장되지 않습니다.'
);
assert(
  !app.includes('!androidBridge() || !window.Sync || !Sync.isOn()'),
  '참여자 목록이 아직 Android 앱에서만 보입니다.'
);

console.log('달력 카드 정보 구조 검사 통과');
