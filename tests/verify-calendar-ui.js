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
/* 탭마다 다른 영역을 보여 주므로, 달을 옮길 때 모든 탭의 내용을 함께 맞춰 둬야
   탭을 옮겼을 때 지난 달 공휴일·메모·요약이 남아 있지 않습니다. */
assert(
  /function renderCalendar\(\)\{[\s\S]*?renderHolidayPanel\(\);[\s\S]*?renderMonthGrid\([\s\S]*?renderMemoPanel\(\);[\s\S]*?renderSummary\(\);[\s\S]*?applyTab\(\);/.test(app),
  '달을 옮길 때 탭별 영역이 함께 갱신되지 않습니다.'
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
/* ---------- 내 조 선택: 머리글 왼쪽에 다섯 조를 모두 펼친다 (사용자 요청 2026-11-28) ----------
   예전의 '내 조 / 전체' 토글은 머리글 가운데에 떠 있어 무엇을 고르는 자리인지 읽히지 않았다.
   보기 전환은 하단 탭이 맡고, 이 줄은 조 선택만 맡는다. */
assert(
  /<header class="app-header">[\s\S]*?id="groupBar"[\s\S]*?<\/header>/.test(index),
  '내 조 선택 줄이 머리글 안에 없습니다.'
);
assert(
  !index.includes('calendarViewTabs') && !css.includes('.calendar-view-tabs'),
  '머리글 가운데에 있던 보기 전환 토글이 아직 남아 있습니다.'
);
assert(
  app.includes('function renderGroupBar()') && app.includes("$('groupBar').addEventListener"),
  '머리글에서 조를 고를 수 없습니다.'
);
assert(
  /\.group-bar\{[^}]*display:flex;[^}]*\}/.test(css) && !/\.group-bar\{[^}]*justify-content:(center|flex-end)/.test(css),
  '내 조 선택 줄이 왼쪽으로 붙어 있지 않습니다.'
);
/* 조 칩에 오늘 근무 색 점을 달아 조를 바꾸지 않고도 누가 뭘 하는지 보이게 한다. */
assert(
  css.includes('.group-chip i{') && app.includes('<i aria-hidden="true"></i>${group}조'),
  '조 칩에 오늘 근무 표시가 없습니다.'
);

/* ---------- 하단 탭: 한 화면을 길게 밀지 않고 네 갈래로 나눈다 (사용자 요청 2026-11-28) ---------- */
assert(
  index.includes('id="tabbar"')
    && ['calendar', 'groups', 'memo', 'info'].every(tab => index.includes(`data-tab="${tab}"`)),
  '하단 탭(달력 · 조 비교 · 메모 · 요약)이 없습니다.'
);
assert(
  app.includes("const TABS = ['calendar', 'groups', 'memo', 'info'];")
    && app.includes('function applyTab()')
    && app.includes('function selectTab('),
  '탭 전환 처리가 없습니다.'
);
assert(
  app.includes("localStorage.setItem(TAB_KEY") && app.includes("localStorage.getItem(CALENDAR_VIEW_KEY) === 'all' ? 'groups'"),
  '보고 있던 탭이 기억되지 않거나, 지난 버전의 전체 보기 설정을 이어받지 않습니다.'
);
assert(
  /\.tabbar\{[\s\S]*?position:fixed;[\s\S]*?\}/.test(css)
    && css.includes('env(safe-area-inset-bottom)')
    && /\.app\{[\s\S]*?padding: 0 12px calc\(var\(--tabbar-h\)/.test(css),
  '하단 탭이 고정되지 않았거나 본문 아래를 가립니다.'
);
/* 달력 칸 높이는 하단 탭이 차지한 높이까지 빼야 아래가 잘리지 않는다. */
assert(
  /--cell-h: clamp\([^;]*var\(--tabbar-h\)/.test(css),
  '달력 칸 높이가 하단 탭 높이를 고려하지 않습니다.'
);
/* 영역마다 어느 탭에 속하는지 적혀 있어야 applyTab이 하나의 기준으로 숨길 수 있다. */
['singleCalendar', 'allGroupsCalendar', 'teamBoard', 'memoPanel', 'holidayPanel', 'summary', 'legend'].forEach(id => {
  assert(
    new RegExp(`id="${id}"[^>]*data-tab-panel="`).test(index),
    `${id} 영역이 어느 탭에 속하는지 적혀 있지 않습니다.`
  );
});
/* 달력 탭에는 달력만 둔다 — 공휴일·요약·범례가 함께 있으면 달력이 다시 밀린다. */
assert(
  (index.match(/data-tab-panel="calendar"/g) || []).length === 1,
  '달력 탭에 달력 말고 다른 영역이 들어가 있습니다.'
);
/* 메모가 몇 개인지 탭에서 바로 보이게 한다. */
assert(
  index.includes('id="memoTabBadge"') && app.includes("const badge = $('memoTabBadge');"),
  '메모 탭에 개수 배지가 없습니다.'
);

/* ---------- 설정에서도 내 조를 바꾼다 ---------- */
assert(
  index.includes('id="setGroupPick"') && app.includes('function renderGroupPick()'),
  '설정에서 내 조를 고를 수 없습니다.'
);
assert(
  app.includes("$('setGroupPick').addEventListener") && css.includes('.pick-group{'),
  '설정의 내 조 선택이 동작하지 않습니다.'
);
assert(
  /renderSettings\(\)\{[\s\S]{0,120}renderGroupPick\(\);/.test(app),
  '설정을 열 때 내 조 선택이 현재 값으로 그려지지 않습니다.'
);

/* ---------- 화면 테마(밝게 · 어둡게 · 자동) ---------- */
assert(
  css.includes(':root[data-theme="dark"]{') && css.includes('color-scheme: dark;'),
  '어두운 화면 팔레트가 없습니다.'
);
/* 머리 스크립트가 첫 칠하기 전에 테마를 정하지 않으면 어두운 화면이 흰색으로 번쩍인다. */
assert(
  /<head>[\s\S]*?document\.documentElement\.dataset\.theme[\s\S]*?<\/head>/.test(index)
    && index.includes("localStorage.getItem('shiftcal.theme')"),
  '첫 칠하기 전에 테마를 정하는 머리 스크립트가 없습니다.'
);
assert(
  index.includes('id="setThemePick"') && app.includes('function renderThemePick()')
    && app.includes("$('setThemePick').addEventListener"),
  '설정에서 화면 테마를 고를 수 없습니다.'
);
assert(
  app.includes("prefers-color-scheme: dark") && app.includes("if(themeMode() === 'auto') applyTheme();"),
  "'자동'일 때 기기 설정 변화를 따라가지 않습니다."
);
assert(
  app.includes('meta[name="theme-color"]'),
  '테마를 바꿔도 브라우저 주소창 색이 그대로입니다.'
);
/* 색을 토큰으로 돌리지 않고 박아 두면 어두운 화면에서 흰 상자가 그대로 남는다.
   흰 바탕이 허용되는 곳은 QR 한 군데뿐이다. */
const whiteBackgrounds = css
  .split(/\r?\n/)
  .filter(line => /background:\s*#fff\b/i.test(line) && !/QR/.test(line));
assert(
  whiteBackgrounds.length === 1 && /172px/.test(whiteBackgrounds[0]),
  `어두운 화면에서 흰색으로 남는 바탕이 있습니다: ${whiteBackgrounds.join(' / ')}`
);
/* QR 만은 흰 바탕을 지켜야 카메라가 읽는다. */
assert(
  /\.sync-qr svg\{[\s\S]*?background:#fff;/.test(css),
  'QR 바탕이 흰색이 아니면 카메라가 읽지 못합니다.'
);

/* ---------- 달력을 좌우로 밀어 달 넘기기 (사용자 신고 2026-11-28: 폰에서 안 밀림) ----------
   세 가지가 각각 혼자서도 제스처를 막을 수 있다. 셋 다 지킨다. */
assert(app.includes('swipeGuardUntil'), '달력을 좌우로 밀어 달을 넘길 수 없습니다.');

/* 1) 미는 곳 — 달력 카드만이 아니라 월 제목 줄에서도 받아야 한다. */
const swipeZone = (app.match(/SWIPE_ZONE\s*=\s*'([^']+)'/) || [])[1];
assert(swipeZone, '스와이프를 받는 영역(SWIPE_ZONE)이 정의되어 있지 않습니다.');
assert(
  swipeZone.includes('.month-nav') && swipeZone.includes('#singleCalendar'),
  `달 제목 줄에서 밀면 반응하지 않습니다: ${swipeZone}`
);

/* 2) 기울기 — 엄지로 미는 자국은 호라서, 가로가 세로의 몇 배여야 한다는 조건을 두면
      현실적인 궤적(가로 150·세로 110)이 걸러진다. 가로가 세로보다 길면 받는다. */
assert(
  !/Math\.abs\(dy\)\s*\*\s*[\d.]+/.test(app),
  '스와이프 판정이 세로 이동에 배수를 곱해 비교합니다 — 엄지로 그리는 호가 거부됩니다.'
);
assert(
  app.includes('Math.abs(dx) <= Math.abs(dy)'),
  '가로가 세로보다 길면 받는 판정이 아닙니다.'
);
const swipeMin = Number((app.match(/SWIPE_MIN\s*=\s*(\d+)/) || [])[1]);
assert(
  swipeMin > 0 && swipeMin <= 50,
  `스와이프 최소 거리가 깁니다(${swipeMin}px) — 짧게 미는 사람은 못 넘깁니다.`
);

/* 3) touch-action — 기본값이면 브라우저가 제스처를 스크롤로 가져가고,
      가져가는 순간 pointermove 가 끊겨 스와이프가 통째로 사라진다. */
['.month-nav{', '.calendar{'].forEach(selector => {
  const block = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
  assert(
    css.includes(selector) && /touch-action:\s*pan-y/.test(block),
    `${selector} 에 touch-action: pan-y 가 없습니다 — 폰에서 가로로 밀어도 반응하지 않습니다.`
  );
});

/* 손을 뗄 때도 한 번 더 본다 — 터치에서 중간 pointermove 가 묶여 오는 경우가 있다. */
assert(
  /pointerup['"],\s*\(e\)=>\{\s*trySwipe\(e\)/.test(app),
  '손을 뗄 때 스와이프를 다시 판정하지 않습니다.'
);
/* 민 직후의 click 은 통째로 막는다(달력 칸이 열리거나 달이 두 번 넘어가지 않게). */
const clickGuard = (app.match(
  /addEventListener\('click',\s*\(e\)=>\{[\s\S]*?\},\s*true\)/
) || [])[0];
assert(
  clickGuard && clickGuard.includes('swipeGuardUntil') && clickGuard.includes('stopPropagation()'),
  '민 직후의 click 을 막지 않아 날짜가 열리거나 달이 두 번 넘어갑니다.'
);
/* 막는 범위는 민 자리 안으로 한정해야 한다 — 화면 전체를 막으면 밀고 나서 바로
   하단 탭을 누른 손가락이 무시된다(실제로 그렇게 되는 것을 보고 좁혔다). */
assert(
  clickGuard.includes('closest(SWIPE_ZONE)'),
  '민 직후 화면 전체의 click 을 막고 있습니다 — 하단 탭이 눌리지 않습니다.'
);

/* ---------- 칸 메모: 칸을 키운 만큼 더 보여 준다 (사용자 신고 2026-11-28) ---------- */
assert(
  app.includes('<span class="cell-memo" title="${escapeHtml(memo)}">${escapeHtml(memo)}</span>'),
  '달력 칸 메모가 아직 18자에서 "…"로 잘립니다.'
);
assert(
  css.includes('-webkit-line-clamp:var(--memo-lines, 2);') && app.includes('function syncMemoLines()'),
  '칸 메모 줄 수가 칸 높이를 따라가지 않습니다.'
);
assert(
  /new ResizeObserver\(\(\)=> syncMemoLines\(\)\)/.test(app),
  '화면 크기가 바뀔 때 메모 줄 수를 다시 세지 않습니다.'
);
/* 메모 탭은 메모를 읽는 자리다 — 한 줄로 자르면 안 된다. */
assert(
  /\.memo-text\{[^}]*white-space:pre-wrap;/.test(css) && !/\.memo-text\{[^}]*white-space:nowrap;/.test(css),
  '메모 탭의 메모가 아직 한 줄로 잘립니다.'
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
/* '오늘 배치'는 조 비교 탭의 머리 카드다 — 달력 아래에 어정쩡하게 놓여 있지 않아야 한다.
   (사용자 지적 2026-11-28: 하단 5개 조 위치가 애매하다) */
assert(
  /id="teamBoard"[^>]*data-tab-panel="groups"/.test(index),
  '오늘 배치가 조 비교 탭에 들어가 있지 않습니다.'
);
assert(
  index.indexOf('id="teamBoard"') < index.indexOf('id="allGroupsCalendar"'),
  '조 비교 탭에서 오늘 배치가 월간 비교표보다 아래에 있습니다.'
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
  index.includes('data-tab="groups"') && index.includes('id="allGroupsGrid"'),
  '전체 조 한눈에 보기의 화면 구조가 없습니다.'
);
assert(
  app.includes('function renderAllGroupsCalendar()') && app.includes('GROUPS.map(group=>'),
  'A/B/C/D 4행 가로 비교표 렌더링이 없습니다.'
);
assert(
  !index.includes('id="groupTabs"') && !index.includes('id="todayBanner"'),
  '예전의 중복된 내 조 선택 또는 오늘 근무 영역이 남아 있습니다.'
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
assert(index.includes('ver 2026.11.28'), '화면 버전 날짜가 2026.11.28으로 갱신되지 않았습니다.');
assert(!index.includes('ver 2026.11.26') && !index.includes('ver 2026.08.03'), '화면에 이전 버전 날짜가 남아 있습니다.');

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
