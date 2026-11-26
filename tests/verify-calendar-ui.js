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

/* 2026-11-26: 공휴일을 더 잘 보이게 해달라는 요청 — 칸에 짧은 이름을 다시 넣되,
   태그가 있는 칸에서는 CSS로 감추고, 전체 이름은 달력 아래 목록에서 읽게 했습니다. */
assert(app.includes('class="cell-hol"'), '달력 칸에 공휴일 이름이 표시되지 않습니다.');
assert(app.includes('function holidayShort('), '달력 칸에 쓸 짧은 공휴일 이름 규칙이 없습니다.');
assert(
  css.includes('.cell.has-tag .cell-hol{ display:none; }'),
  '태그가 있는 칸에서 공휴일 이름이 자리를 다투고 있습니다.'
);
assert(
  app.includes('function renderHolidayPanel()') && index.includes('id="holidayPanel"'),
  '달력 아래 이번 달 공휴일 목록이 없습니다.'
);
assert(app.includes('function holidaysInMonth('), '연속된 공휴일을 묶어 보여주는 처리가 없습니다.');
/* 전체 조 보기는 renderCalendar가 일찍 빠져나가므로, 공휴일 목록은 갈라지기 전에 그려야
   달을 넘길 때 지난 달 공휴일이 그대로 남아 있지 않습니다. */
assert(
  app.includes("renderHolidayPanel();   // 두 보기 모두에서 쓰므로 갈라지기 전에 그린다"),
  '전체 조 보기에서 공휴일 목록이 갱신되지 않습니다.'
);
assert(
  app.includes('${DESIG[ti.tag].short}</span>'),
  '달력 카드의 정산 태그가 지근·지휴·특근 공통 라벨이 아닙니다.'
);
assert(
  app.includes('<span class="cell-top"><span class="dnum ${dnumCls}">${d}</span>${holHtml}${tagHtml}${isFam'),
  '날짜 · 공휴일명 · 정산 태그 · 패밀리데이 한 줄 구조가 변경됐습니다.'
);
/* 패밀리데이는 하트 그림 대신 글자로 적는다(사용자 요청 2026-11-26). */
assert(
  app.includes('class="fam-mark" title="${escapeHtml(famHint)}">패데<') && !app.includes('💛'),
  '패밀리데이 표시가 작은 글자 꼬리표가 아닙니다.'
);
assert(
  css.includes('.cell.has-tag .fam-mark{ display:none; }'),
  '정산 태그와 패밀리데이 표시가 같은 자리를 다투고 있습니다.'
);
/* 보기 전환은 머리글 안의 작은 토글이어야 한다 — 한 줄을 통째로 쓰면 달력이 밀린다. */
assert(
  /<header class="app-header">[\s\S]*?id="calendarViewTabs"[\s\S]*?<\/header>/.test(index),
  '보기 전환 버튼이 머리글 안에 있지 않습니다.'
);
assert(
  css.includes('.calendar-view-tabs{') && /\.calendar-view-tabs\{[^}]*margin:0;/.test(css),
  '보기 전환 토글이 아직 아래쪽 여백을 차지하고 있습니다.'
);
/* 달력 한 칸 높이는 화면 높이를 따라간다(작은 폰은 한계값까지만). */
assert(
  css.includes('--cell-h: clamp(') && css.includes('100dvh') && css.includes('var(--rows)'),
  '달력 칸 높이가 화면 높이와 그 달의 줄 수를 따라가지 않습니다.'
);
assert(
  app.includes("gridEl.style.setProperty('--rows', Math.ceil((startDow + daysInMonth) / 7));"),
  '그 달이 쓰는 줄 수를 달력에 알려주지 않아 5줄 달에서 아래가 남습니다.'
);
/* 근무 칩이 메모 자리까지 늘어나면 안 된다(사용자 요청 2026-11-26). */
assert(
  !css.includes('.cell:not(.has-memo) .badge{'),
  '근무 칩이 메모 영역까지 침범하고 있습니다.'
);
/* '오늘 배치'는 메모 아래 — 달력이 화면을 먼저 차지해야 한다. */
assert(
  index.indexOf('id="memoPanel"') < index.indexOf('id="teamBoard"'),
  '오늘 배치가 아직 달력 위에 있습니다.'
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
  css.includes('grid-template-rows:28px repeat(var(--rows, 5), 68px);')
    && app.includes("grid.style.setProperty('--rows', GROUPS.length);"),
  '조별 비교표의 행 수가 조 개수를 따라가지 않습니다.'
);
assert(
  app.includes('<b>오늘 · ${todayLabel}</b>'),
  'A/B/C/D 오늘 배치 머리글에 오늘 날짜가 없습니다.'
);
assert(
  app.includes('class="team-time" title="${escapeHtml(timeText(t))}">${escapeHtml(compactTime(t))}')
    && app.includes('function compactTime(t)'),
  '선택한 조 카드에 오늘 근무 시간이 없습니다. (좁은 칸용 짧은 꼴 + 전체는 title)'
);

/* ---------- 오늘 배치: 한 줄에 다섯 조 · 스르륵 접기 ---------- */
assert(
  !/@media[^{]*\{\s*\.team-grid\{[^}]*grid-template-columns/.test(css),
  '좁은 화면에서 조 카드가 여러 줄로 접히고 있습니다.'
);
assert(
  css.includes('.team-grid-wrap{') && css.includes('grid-template-rows:0fr'),
  '오늘 배치가 높이 전환 없이 즉시 사라집니다(스르륵 접히지 않습니다).'
);
assert(
  app.includes('/* 다시 그리지 않고 클래스만 바꾼다')
    && app.includes("if(toggle) toggle.setAttribute('aria-expanded'"),
  '접을 때 다시 그려서 전환이 보이지 않습니다.'
);
assert(
  css.includes('@media (prefers-reduced-motion: reduce)'),
  '움직임을 줄이도록 설정한 사람을 위한 처리가 없습니다.'
);
assert(
  app.includes('const GROUPS = [OFFICE_GROUP, ...SHIFT_GROUPS];'),
  '기본 조(O조)가 첫 번째 자리에 있지 않습니다.'
);
assert(
  !app.includes('<b>${BASE_DATE} 기준</b>'),
  '오늘 배치 머리글에 과거 기준일이 남아 있습니다.'
);
assert(!css.includes('.today-banner') && !css.includes('.tb-time'), '삭제된 오늘 배너 CSS가 남아 있습니다.');
assert(index.includes('ver 2026.11.26'), '화면 버전 날짜가 2026.11.26으로 갱신되지 않았습니다.');
assert(!index.includes('ver 2026.08.03'), '화면에 이전 버전 날짜가 남아 있습니다.');

/* ---------- 오늘 배치: 접고 펼치기 ---------- */
assert(
  app.includes('function toggleTeamBoard()') && app.includes("id=\"teamToggle\""),
  '오늘 배치를 접고 펼치는 버튼이 없습니다.'
);
assert(
  app.includes("localStorage.setItem(TEAM_BOARD_KEY"),
  '오늘 배치를 접어 둔 상태가 다음에 열 때까지 기억되지 않습니다.'
);

/* ---------- 기간 시트도 보기 전용을 따른다 ---------- */
assert(
  app.includes("function openRangeSheet(a, b){") && /function openRangeSheet[\s\S]{0,1200}const ro = !canEdit\(\);/.test(app),
  '기간 시트가 보기 전용 여부를 보지 않습니다.'
);
assert(
  /function openRangeSheet[\s\S]{0,2200}\$\('btnRevert'\)\.hidden = ro;/.test(app),
  '보기 전용인데도 기간 시트의 지우기 버튼이 열려 있습니다.'
);
assert(
  app.includes("if(!canEdit()) return;   // 보기 전용은 근무표를 지울 수 없다"),
  '되돌리기 버튼 처리에 권한 가드가 없습니다.'
);
assert(
  app.includes('function clearRange(group, days)') && app.includes("Sync.saveMemo(group, ds, '')"),
  '기간 되돌리기가 지운 메모를 공유방에 알리지 않습니다.'
);
assert(
  sync.includes('function scheduleMemoRetry()') && sync.includes('permission-denied'),
  '메모 업로드가 실패했을 때 다시 시도하는 처리가 없습니다.'
);

/* ---------- 메모를 쓰는 중에는 입력칸을 건드리지 않는다 ---------- */
assert(
  sync.includes('function typingMemo()') && sync.includes('if(typingMemo()) return;'),
  '메모 입력 중 원격 변경이 입력칸을 덮어쓰는 것을 막는 처리가 없습니다.'
);
assert(
  app.includes('if(memoBox.value !== memoText) memoBox.value = memoText;'),
  '값이 같은데도 입력칸을 다시 채워 커서가 끝으로 튑니다.'
);

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
