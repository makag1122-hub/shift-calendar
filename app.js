'use strict';

/* ============================================================
   교대캘린더 — 변형 4조 3교대(A·B·C·D) + 오피스조(O)
   근무 종류: D / S / G / O / D2 / G2 / 휴 / 연차 / 특휴 / 패밀리데이
   - 근무 종류 자유 커스텀(추가·삭제·수정)
   - 반복 패턴(사이클) 자동 계산 + 날짜별 수동 변경(override)
   - 데이터는 localStorage 저장
   ============================================================ */

const STORAGE_KEY = 'shiftcal.v2';
const CALENDAR_VIEW_KEY = 'shiftcal.calendarView';   // 지난 버전의 '내 조/전체' 토글
const TAB_KEY = 'shiftcal.tab';
const THEME_KEY = 'shiftcal.theme';
/* 화면 테마 — '자동'은 기기 설정(다크 모드)을 따라간다. index.html 의 머리 스크립트가
   첫 칠하기 전에 같은 값을 읽어 data-theme 을 정해 두므로 여기서는 바꾸기만 하면 된다. */
const THEMES = [
  { key:'auto',  label:'자동',   note:'기기 설정' },
  { key:'light', label:'밝게',   note:'항상 흰 화면' },
  { key:'dark',  label:'어둡게', note:'항상 검은 화면' },
];
const THEME_COLORS = { light:'#18233f', dark:'#10131b' };
/* 한 화면을 길게 밀어 보지 않고 네 갈래로 나눈다 — 달력 / 조 비교 / 메모 / 요약 */
const TABS = ['calendar', 'groups', 'memo', 'info'];
const TEAM_BOARD_KEY = 'shiftcal.teamBoardOpen';
const BASE_DATE = '2026-06-25';
const BASE_PATTERN_START = '2026-06-09'; // 2026-06-25 = A조 GY 4일차
const SHIFT_GROUPS = ['A','B','C','D'];          // 20일 주기로 도는 교대조
const OFFICE_GROUP = 'O';                        // 오피스조: 주기 없이 달력(월~금)으로 정해짐
const GROUPS = [OFFICE_GROUP, ...SHIFT_GROUPS];   // 기본 조이므로 맨 앞
const GROUP_OFFSETS = { A:0, B:5, C:10, D:15 };  // 오피스조는 주기를 쓰지 않아 오프셋이 없다
function emptyGroupMap(){ return Object.fromEntries(GROUPS.map(g => [g, {}])); }

/* ---------- 날짜 유틸 ---------- */
function pad(n){ return String(n).padStart(2, '0'); }
function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function todayStr(){ return ymd(new Date()); }
function parseYmd(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function dayDiff(aStr, bStr){
  const a = parseYmd(aStr), b = parseYmd(bStr);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}
function addDays(dateStr, n){ const d = parseYmd(dateStr); d.setDate(d.getDate()+n); return ymd(d); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const WEEK = ['일','월','화','수','목','금','토'];

/* ---------- 공휴일(빨간날) ----------
   출처: 우주항공청 2026·2027년 월력요항 / 국가법령정보센터 관공서공휴일규정.
   2026년 22일 + 2027년 24일(노동절·제헌절 및 대체공휴일 포함). 해마다 갱신 필요. */
const HOLIDAYS = {
  '2026-01-01':'신정',
  '2026-02-16':'설날','2026-02-17':'설날','2026-02-18':'설날',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체',
  '2026-05-01':'노동절',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날','2026-05-25':'부처님오신날 대체',
  '2026-06-03':'지방선거','2026-06-06':'현충일',
  '2026-07-17':'제헌절',
  '2026-08-15':'광복절','2026-08-17':'광복절 대체',
  '2026-09-24':'추석','2026-09-25':'추석','2026-09-26':'추석',
  '2026-10-03':'개천절','2026-10-05':'개천절 대체',
  '2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
  // 2027년 (24일 — 노동절·제헌절 상시 공휴일 및 대체공휴일 포함). 설날/추석·부처님오신날은 음력 기준.
  '2027-01-01':'신정',
  '2027-02-06':'설날','2027-02-07':'설날','2027-02-08':'설날','2027-02-09':'설날 대체',
  '2027-03-01':'삼일절',
  '2027-05-01':'노동절','2027-05-03':'노동절 대체',
  '2027-05-05':'어린이날',
  '2027-05-13':'부처님오신날',
  '2027-06-06':'현충일',
  '2027-07-17':'제헌절','2027-07-19':'제헌절 대체',
  '2027-08-15':'광복절','2027-08-16':'광복절 대체',
  '2027-09-14':'추석','2027-09-15':'추석','2027-09-16':'추석',
  '2027-10-03':'개천절','2027-10-04':'개천절 대체',
  '2027-10-09':'한글날','2027-10-11':'한글날 대체',
  '2027-12-25':'크리스마스','2027-12-27':'크리스마스 대체',
};
function holidayName(dateStr){ return HOLIDAYS[dateStr] || null; }
function isHoliday(dateStr){ return !!HOLIDAYS[dateStr]; }
/* 달력 칸은 좁아서 긴 이름을 줄여 적는다. 전체 이름은 아래 '이번 달 공휴일' 목록과 날짜 상세에 그대로 나온다. */
const HOLIDAY_SHORT = { '부처님오신날':'석탄일', '크리스마스':'성탄절', '어린이날':'어린이', '지방선거':'선거' };
function holidayShort(name){
  if(!name) return '';
  const base = name.endsWith(' 대체') ? name.slice(0, -3) : name;
  return HOLIDAY_SHORT[base] || base;
}
/* 한 달의 공휴일을 연속한 날끼리 묶어 목록으로 (예: 2/16~18 설날) */
function holidaysInMonth(year, month0){
  const ym = `${year}-${pad(month0+1)}`;
  const dim = new Date(year, month0+1, 0).getDate();
  const out = [];
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    const name = holidayName(ds);
    if(!name) continue;
    const last = out[out.length-1];
    if(last && last.name === name && last.endDay === d-1) last.endDay = d;
    else out.push({ name, startDay:d, endDay:d });
  }
  return out;
}

/* ---------- 명절(설날·추석) 특별 근무표 ----------
   명절엔 로테이션 전체가 재편성됩니다(6일 연속근무·12시간 D2/G2 커버 발생).
   실제 회사 편성표(DS소방대캘린더 캡처, 2026-07-13 대조 완료 — 244건 전부 일치)를 그대로 옮긴 것.
   조별 [시작일, 끝일, 근무키] 구간 목록 → 정규 패턴 위에 덮어써지고, 달력에서 직접 바꾸면 그게 더 우선.
   ※ 다음 명절 편성이 나오면 여기에 구간을 이어서 추가 + 필요시 PATTERN_REANCHORS에 새 기준일 추가. */
function expandRuns(runs){
  const out = {};
  for(const [from, to, key] of runs){
    let d = from;
    while(true){ out[d] = key; if(d === to) break; d = addDays(d, 1); }
  }
  return out;
}
const SPECIAL_SCHEDULE = {
  // 2026 추석 편성 (9/10 ~ 10/12)
  A: expandRuns([
    ['2026-09-10','2026-09-10','OFF'], ['2026-09-11','2026-09-16','G'],  ['2026-09-17','2026-09-18','OFF'],
    ['2026-09-19','2026-09-23','D'],   ['2026-09-24','2026-09-27','OFF'],['2026-09-28','2026-10-02','S'],
    ['2026-10-03','2026-10-03','OFF'], ['2026-10-04','2026-10-09','G'],  ['2026-10-10','2026-10-11','OFF'],
    ['2026-10-12','2026-10-12','D'],
  ]),
  B: expandRuns([
    ['2026-09-10','2026-09-10','G'],   ['2026-09-11','2026-09-12','OFF'],['2026-09-13','2026-09-18','D'],
    ['2026-09-19','2026-09-20','OFF'], ['2026-09-21','2026-09-26','S'],  ['2026-09-27','2026-09-27','OFF'],
    ['2026-09-28','2026-10-03','G'],   ['2026-10-04','2026-10-05','OFF'],['2026-10-06','2026-10-11','D'],
    ['2026-10-12','2026-10-12','OFF'],
  ]),
  C: expandRuns([
    ['2026-09-10','2026-09-12','D'],   ['2026-09-13','2026-09-14','OFF'],['2026-09-15','2026-09-20','S'],
    ['2026-09-21','2026-09-21','OFF'], ['2026-09-22','2026-09-26','G'],  ['2026-09-27','2026-09-27','G2'],
    ['2026-09-28','2026-09-29','OFF'], ['2026-09-30','2026-10-05','D'],  ['2026-10-06','2026-10-08','OFF'],
    ['2026-10-09','2026-10-12','S'],
  ]),
  D: expandRuns([
    ['2026-09-10','2026-09-14','S'],   ['2026-09-15','2026-09-16','OFF'],['2026-09-17','2026-09-21','G'],
    ['2026-09-22','2026-09-23','OFF'], ['2026-09-24','2026-09-26','D'],  ['2026-09-27','2026-09-27','D2'],
    ['2026-09-28','2026-09-29','D'],   ['2026-09-30','2026-10-02','OFF'],['2026-10-03','2026-10-08','S'],
    ['2026-10-09','2026-10-09','OFF'], ['2026-10-10','2026-10-12','G'],
  ]),
};

/* 명절 후 로테이션 재기준일: 2026 추석을 지나며 전체 로테이션이 6일 밀림.
   해당 날짜 이후는 이 앵커(= A조 cycle[0])로 계산. 다음 명절 때 항목 추가. */
const PATTERN_REANCHORS = [
  { from: '2026-10-13', anchor: '2026-10-13' },
];
function patternAnchorFor(dateStr){
  let a = state.pattern.startDate;
  for(const r of PATTERN_REANCHORS){ if(dateStr >= r.from) a = r.anchor; }
  return a;
}

/* ---------- 기본 상태 ----------
   ※ 모든 시간/이름/색/패턴은 설정에서 자유롭게 바꿀 수 있는 "기본값"입니다. */
const DEFAULT_STATE = {
  version: 7,
  activeGroup: OFFICE_GROUP,
  shiftOrder: ['D','S','G','O','D2','G2','OFF','ANN','TH','FAM'],
  shiftTypes: {
    D:   { label:'DAY',  short:'D',  start:'06:00', end:'14:00', color:'#f59e0b', kind:'work' },
    S:   { label:'SW',   short:'S',  start:'14:00', end:'22:00', color:'#10b981', kind:'work' },
    G:   { label:'GY',   short:'G',  start:'22:00', end:'06:00', color:'#6366f1', kind:'work' },
    O:   { label:'오피스', short:'O',  start:'09:00', end:'18:00', color:'#0ea5e9', kind:'work' },
    D2:  { label:'DAY2', short:'D2', start:'06:00', end:'18:00', color:'#fb923c', kind:'work' },
    G2:  { label:'GY2',  short:'G2', start:'18:00', end:'06:00', color:'#a78bfa', kind:'work' },
    OFF: { label:'휴무', short:'휴', start:'',      end:'',      color:'#94a3b8', kind:'off'  },
    ANN: { label:'연차',       short:'연차', start:'', end:'', color:'#0891b2', kind:'off', leave:true }, // 휴가: 태그 정산 제외
    TH:  { label:'특휴',       short:'특휴', start:'', end:'', color:'#9333ea', kind:'off', leave:true }, // 휴가: 태그 정산 제외
    FAM: { label:'패밀리데이',  short:'패밀', start:'', end:'', color:'#db2777', kind:'off', leave:true }, // 휴가: 태그 정산 제외
  },
  pattern: {
    // 20일 주기: D×5 · 휴×2 · S×5 · 휴×1 · G×5 · 휴×2
    cycle: ['D','D','D','D','D','OFF','OFF','S','S','S','S','S','OFF','G','G','G','G','G','OFF','OFF'],
    startDate: BASE_PATTERN_START,   // 이 날짜 = A조 cycle[0] (첫 D)
  },
  groupOverrides: emptyGroupMap(), // { A: { 'YYYY-MM-DD': shiftKey }, ... } — 수동 변경(빨간 네모 표시)
  groupBaseline:  emptyGroupMap(), // 확정된 '기본 근무'(표시 없음). 패턴/명절보다 우선, 수동변경보다 아래
  overrides: {},  // legacy: A조 수동 변경
  groupMemos: emptyGroupMap(),     // 조별 메모 { A: { 'YYYY-MM-DD': '메모' }, ... }
  groupDesig: emptyGroupMap(),     // 조별 수동 지정태그 { A: { 'YYYY-MM-DD': 'JG'|'JH' }, ... }
  groupDesigCount: emptyGroupMap(),// 조별 월별 자동배치 개수 { A: { 'YYYY-MM': { jg, jh } }, ... }
};
const DEFAULT_CYCLE = ['D','D','D','D','D','OFF','OFF','S','S','S','S','S','OFF','G','G','G','G','G','OFF','OFF'];
// 태그(근무 위에 덧붙는 태그): 특근/지근/지휴
const DESIG = {
  TG: { label:'특근', short:'특근', color:'#dc2626' },
  JG: { label:'지근', short:'지근', color:'#ef4444' },
  JH: { label:'지휴', short:'지휴', color:'#0d9488' },
};

/* ---------- 상태 로드/저장 ---------- */
function clone(o){ return JSON.parse(JSON.stringify(o)); }

function migrate(s){
  const base = clone(DEFAULT_STATE);
  const out = clone(base);
  if(s && typeof s === 'object'){
    const savedVersion = Number(s.version) || 0;
    if(s.shiftTypes && typeof s.shiftTypes === 'object'){
      out.shiftTypes = { ...base.shiftTypes, ...s.shiftTypes }; // 저장값 우선 + 내장 종류 보강
      for(const k in out.shiftTypes){
        const b = base.shiftTypes[k];
        if(!out.shiftTypes[k].kind) out.shiftTypes[k].kind = (b && b.kind) || 'work';
        if(b && b.special) out.shiftTypes[k].special = b.special; // 내장 특수근무 규칙 유지
        if(b && b.leave) out.shiftTypes[k].leave = b.leave;       // 내장 휴가(연차/특휴/패밀리데이) 규칙 유지
      }
    }
    if(Array.isArray(s.shiftOrder) && s.shiftOrder.length){
      const order = s.shiftOrder.filter(k => out.shiftTypes[k]);
      for(const k of base.shiftOrder){ if(out.shiftTypes[k] && !order.includes(k)) order.push(k); }
      out.shiftOrder = order;
    }
    if(s.pattern && typeof s.pattern === 'object'){
      if(Array.isArray(s.pattern.cycle)) out.pattern.cycle = s.pattern.cycle;
      if(s.pattern.startDate) out.pattern.startDate = s.pattern.startDate;
    }
    if(savedVersion < 4 && out.pattern.startDate === BASE_DATE){
      out.pattern.startDate = BASE_PATTERN_START;
    }
    out.activeGroup = (savedVersion >= 7 && GROUPS.includes(s.activeGroup)) ? s.activeGroup : base.activeGroup;
    out.groupOverrides = clone(base.groupOverrides);
    if(s.groupOverrides && typeof s.groupOverrides === 'object'){
      for(const group of GROUPS){
        if(s.groupOverrides[group] && typeof s.groupOverrides[group] === 'object'){
          out.groupOverrides[group] = s.groupOverrides[group];
        }
      }
    } else if(s.overrides && typeof s.overrides === 'object'){
      out.groupOverrides.A = s.overrides;
    }
    out.overrides = out.groupOverrides.A;
    out.groupBaseline = clone(base.groupBaseline);
    if(s.groupBaseline && typeof s.groupBaseline === 'object'){
      for(const group of GROUPS){
        if(s.groupBaseline[group] && typeof s.groupBaseline[group] === 'object'){
          out.groupBaseline[group] = s.groupBaseline[group];
        }
      }
    }
    out.groupMemos = clone(base.groupMemos);
    if(s.groupMemos && typeof s.groupMemos === 'object'){
      for(const group of GROUPS){
        if(s.groupMemos[group] && typeof s.groupMemos[group] === 'object') out.groupMemos[group] = s.groupMemos[group];
      }
    } else if(s.memos && typeof s.memos === 'object'){
      out.groupMemos.A = s.memos; // 레거시 전역 메모 → A조
    }
    if(s.groupDesig && typeof s.groupDesig === 'object'){
      for(const group of GROUPS){
        if(s.groupDesig[group] && typeof s.groupDesig[group] === 'object') out.groupDesig[group] = s.groupDesig[group];
      }
    }
    if(s.groupDesigCount && typeof s.groupDesigCount === 'object'){
      for(const group of GROUPS){
        if(s.groupDesigCount[group] && typeof s.groupDesigCount[group] === 'object') out.groupDesigCount[group] = s.groupDesigCount[group];
      }
    }
  }
  out.version = base.version;
  out.activeGroup = GROUPS.includes(out.activeGroup) ? out.activeGroup : base.activeGroup;
  out.groupOverrides = out.groupOverrides || clone(base.groupOverrides);
  for(const group of GROUPS){
    if(!out.groupOverrides[group] || typeof out.groupOverrides[group] !== 'object'){
      out.groupOverrides[group] = {};
    }
  }
  out.groupBaseline = out.groupBaseline || clone(base.groupBaseline);
  for(const group of GROUPS){
    if(!out.groupBaseline[group] || typeof out.groupBaseline[group] !== 'object'){
      out.groupBaseline[group] = {};
    }
  }
  if(!out.groupMemos || typeof out.groupMemos !== 'object') out.groupMemos = clone(base.groupMemos);
  for(const group of GROUPS){
    if(!out.groupMemos[group] || typeof out.groupMemos[group] !== 'object') out.groupMemos[group] = {};
  }
  // 지정 태그 안전장치 + 레거시 JG/JH 근무(override) → 태그로 전환
  if(!out.groupDesig || typeof out.groupDesig !== 'object') out.groupDesig = clone(base.groupDesig);
  if(!out.groupDesigCount || typeof out.groupDesigCount !== 'object') out.groupDesigCount = clone(base.groupDesigCount);
  for(const group of GROUPS){
    if(!out.groupDesig[group] || typeof out.groupDesig[group] !== 'object') out.groupDesig[group] = {};
    if(!out.groupDesigCount[group] || typeof out.groupDesigCount[group] !== 'object') out.groupDesigCount[group] = {};
    const ov = out.groupOverrides[group];
    for(const dt in ov){ if(ov[dt] === 'JG' || ov[dt] === 'JH'){ out.groupDesig[group][dt] = ov[dt]; delete ov[dt]; } }
  }
  delete out.shiftTypes.JG; delete out.shiftTypes.JH;  // 이제 태그 → 근무 종류에서 제거
  out.overrides = out.groupOverrides.A;
  out.shiftOrder = out.shiftOrder.filter(k => out.shiftTypes[k]);
  if(!out.shiftOrder.length){ out.shiftTypes = base.shiftTypes; out.shiftOrder = base.shiftOrder.slice(); }
  if(!Array.isArray(out.pattern.cycle)) out.pattern.cycle = clone(DEFAULT_CYCLE);
  if(!out.pattern.startDate) out.pattern.startDate = todayStr();
  return out;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return clone(DEFAULT_STATE);
    return migrate(JSON.parse(raw));
  }catch(e){
    console.warn('상태 불러오기 실패, 기본값 사용', e);
    return clone(DEFAULT_STATE);
  }
}
function saveState(notifySync = true){
  try{
    state.overrides = groupOverrideMap('A');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if(notifySync && window.Sync && Sync.onLocalSave) Sync.onLocalSave();  // 근무표 변경만 전체 상태 동기화
  }
  catch(e){ console.warn('저장 실패', e); }
}
// 공유 상대는 근무표 편집은 차단하고 메모만 작성 가능
function canEdit(){ return !(window.Sync && Sync.readonly && Sync.readonly()); }
function canEditMemo(){
  return canEdit() || !!(window.Sync && Sync.canWriteMemo && Sync.canWriteMemo());
}

let state = loadState();
let view = { year: new Date().getFullYear(), month: new Date().getMonth() }; // month: 0-11
let activeTab = (() => {
  try{
    const saved = localStorage.getItem(TAB_KEY);
    if(TABS.includes(saved)) return saved;
    /* 지난 버전에서 '전체' 보기를 켜 둔 사람은 조 비교 탭으로 이어 준다. */
    return localStorage.getItem(CALENDAR_VIEW_KEY) === 'all' ? 'groups' : 'calendar';
  }
  catch(e){ return 'calendar'; }
})();
let selectedDate = null;
let sheetRange = null;   // 범위 시트 모드 { start, end }
let rangeAnchor = null;  // 길게 눌러 시작한 날짜

/* ---------- 근무 계산 ---------- */
function patternShiftFor(dateStr){
  const idx = cycleIndexFor(dateStr);
  return idx === null ? null : state.pattern.cycle[idx];
}
function st(key){ return key ? state.shiftTypes[key] : null; }
function normalizeGroup(group){ return GROUPS.includes(group) ? group : OFFICE_GROUP; }
function isOfficeGroup(group){ return normalizeGroup(group) === OFFICE_GROUP; }
function currentGroup(){ return normalizeGroup(state.activeGroup); }
function groupOffset(group){ return GROUP_OFFSETS[normalizeGroup(group)] || 0; }
function groupOverrideMap(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupOverrides) state.groupOverrides = emptyGroupMap();
  if(!state.groupOverrides[g]) state.groupOverrides[g] = {};
  return state.groupOverrides[g];
}
function memosFor(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupMemos) state.groupMemos = emptyGroupMap();
  if(!state.groupMemos[g]) state.groupMemos[g] = {};
  return state.groupMemos[g];
}
function isOverride(dateStr, group = currentGroup()){
  return Object.prototype.hasOwnProperty.call(groupOverrideMap(group), dateStr);
}
function groupBaselineMap(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupBaseline) state.groupBaseline = emptyGroupMap();
  if(!state.groupBaseline[g]) state.groupBaseline[g] = {};
  return state.groupBaseline[g];
}
function isBaseline(dateStr, group = currentGroup()){
  const key = groupBaselineMap(group)[dateStr];
  return !!(key && state.shiftTypes[key]);   // 삭제된 근무 key 면 무시
}
function shiftFor(dateStr, group = currentGroup()){
  const overrides = groupOverrideMap(group);
  const key = isOverride(dateStr, group) ? overrides[dateStr] : groupShiftFor(dateStr, group);
  return state.shiftTypes[key] ? key : null;  // 삭제된 근무 key 면 null
}
function mod(n, m){ return ((n % m) + m) % m; }
function cycleIndexFor(dateStr, offset = 0){
  const cycle = state.pattern.cycle;
  if(!cycle || !cycle.length) return null;
  return mod(dayDiff(patternAnchorFor(dateStr), dateStr) + offset, cycle.length);
}
// 명절 특별근무: 정규 패턴 위에 덮어쓰는 '기본 근무'로 취급(사용자 수동변경이 최우선)
function specialShiftFor(dateStr, group){
  const m = SPECIAL_SCHEDULE[normalizeGroup(group)];
  const key = m && m[dateStr];
  return (key && state.shiftTypes[key]) ? key : null;
}
function isSpecialSchedule(dateStr, group = currentGroup()){ return !!specialShiftFor(dateStr, group); }
/* 오피스조(O조) 근무 — 주기 패턴이 아니라 달력으로 정해진다.
   주말·공휴일은 휴무, 나머지 평일은 오피스 근무.
   ※ 패밀리데이는 여기서 근무로 바꾸지 않는다. 쓸지 말지는 본인이 정하는 거라
      달력엔 '패데' 꼬리표(참고)만 띄우고, 실제로 쉬면 그 날만 손으로 바꾸면 된다.
   ※ 명절 특별편성(SPECIAL_SCHEDULE)은 교대 로테이션 재편성이라 오피스조와는 무관하다. */
function officeShiftFor(dateStr){
  if(isHoliday(dateStr) || isWeekend(dateStr)) return 'OFF';
  return 'O';
}
function groupShiftFor(dateStr, group){
  const bl = groupBaselineMap(group)[dateStr];         // 확정된 기본 근무가 최우선(패턴·명절보다)
  if(bl && state.shiftTypes[bl]) return bl;
  if(isOfficeGroup(group)) return officeShiftFor(dateStr);
  const sp = specialShiftFor(dateStr, group);
  if(sp) return sp;
  const idx = cycleIndexFor(dateStr, groupOffset(group));
  return idx === null ? null : state.pattern.cycle[idx];
}
// 실제 근무표(수동변경·명절 포함) 기준 '연속근무' 계산
function isWorkDay(dateStr, group){ const t = state.shiftTypes[shiftFor(dateStr, group)]; return !!(t && t.kind !== 'off'); }
function workRunDayFor(dateStr, group){       // 이 날 포함, 연속근무 며칠째(휴무면 0)
  if(!isWorkDay(dateStr, group)) return 0;
  let day = 1, d = dateStr;
  for(let i=0; i<20; i++){ d = addDays(d, -1); if(isWorkDay(d, group)) day++; else break; }
  return day;
}
function workRunTotalFor(dateStr, group){      // 이 날이 속한 연속근무의 총 길이
  if(!isWorkDay(dateStr, group)) return 0;
  let total = workRunDayFor(dateStr, group), d = dateStr;
  for(let i=0; i<20; i++){ d = addDays(d, 1); if(isWorkDay(d, group)) total++; else break; }
  return total;
}
function runDayAtIndex(idx){
  const cycle = state.pattern.cycle;
  if(idx === null || !cycle || !cycle.length) return null;
  const key = cycle[idx];
  let day = 1;
  for(let step = 1; step < cycle.length; step++){
    const prev = idx - step;
    if(prev < 0 || cycle[prev] !== key) break;
    day++;
  }
  return day;
}
function groupRunDayFor(dateStr, group){
  return runDayAtIndex(cycleIndexFor(dateStr, groupOffset(group)));
}
function offRunDayFor(dateStr, group){          // 이 날 포함, 연속휴무 며칠째(근무면 0)
  if(isWorkDay(dateStr, group)) return 0;
  let day = 1, d = dateStr;
  for(let i=0; i<20; i++){ d = addDays(d, -1); if(!isWorkDay(d, group)) day++; else break; }
  return day;
}
function shiftDayText(dateStr, group){
  if(isOverride(dateStr, group)) return '수동 변경';
  // 실제 근무표(명절 편성·재기준 포함) 기준 연속 일수 — 6근이면 1~6일차로 표시됨
  const n = isWorkDay(dateStr, group) ? workRunDayFor(dateStr, group) : offRunDayFor(dateStr, group);
  return n ? `${n}일차` : '';
}
function isNextDay(t){ return !!(t && t.start && t.end && t.end <= t.start); } // 예: 22:00 → 06:00
/* 조 카드는 한 줄에 다섯이라 칸이 좁다. 공백을 뺀 짧은 꼴로 적고 전체는 title에 둔다. */
function compactTime(t){
  if(!t) return '';
  if(t.start) return `${t.start}~${t.end}`;
  return (t.kind === 'work') ? '근무' : '쉬는 날';
}
function timeText(t){
  if(!t) return '';
  if(t.start) return `${t.start} ~ ${t.end}${isNextDay(t) ? ' (익일)' : ''}`;
  return (t.kind === 'work') ? '근무' : '쉬는 날';
}
// 특수근무 배치 규칙: 지정휴무(지휴)는 '근무일'에만, 지정근무(지근)는 '휴무일'에만
function patternKind(dateStr, group = currentGroup()){
  const t = state.shiftTypes[groupShiftFor(dateStr, group)];
  return t ? (t.kind || 'work') : 'off';
}
function canPlace(key, dateStr, group = currentGroup()){
  const t = state.shiftTypes[key];
  if(!t || !t.special) return true;          // 일반 근무는 제한 없음
  const baseWork = patternKind(dateStr, group) === 'work';
  if(t.special === 'desigOff')  return baseWork;   // 지휴: 근무일에만
  if(t.special === 'desigWork') return !baseWork;  // 지근: 휴무일에만
  return true;
}
function isWeekend(dateStr){ const d = parseYmd(dateStr).getDay(); return d === 0 || d === 6; }
function isWeekday(dateStr){ return !isWeekend(dateStr); }
/* 패밀리데이 가능일 — 조에 따라 규칙이 다르다.
   · 교대조  : 급여일(21일)이 속한 주의 2주 전 주 금요일 → 매월 5~11일 사이 금요일
   · 오피스조: 급여일(21일)까지 포함해 가장 가까운 앞 금요일 → 매월 15~21일 사이 금요일 */
function familyDayDom(year, month0){ const dow21 = new Date(year, month0, 21).getDay(); return 11 - ((dow21 + 6) % 7); }
function officeFamilyDayDom(year, month0){ const dow21 = new Date(year, month0, 21).getDay(); return 21 - ((dow21 + 2) % 7); }
function familyDayStr(year, month0, group = currentGroup()){
  const dom = isOfficeGroup(group) ? officeFamilyDayDom(year, month0) : familyDayDom(year, month0);
  return `${year}-${pad(month0+1)}-${pad(dom)}`;
}
function familyDayHint(group = currentGroup()){
  return isOfficeGroup(group) ? '패밀리데이 (급여일 직전 금요일)' : '패밀리데이 가능일 (급여일 2주 전 금)';
}
/* '패데' 꼬리표는 '이 날이 패밀리데이구나' 하는 참고 표시일 뿐, 근무를 대신 바꿔주지는 않는다. */
function familyDayNote(group = currentGroup()){
  return `${familyDayHint(group)} · 쓰면 이 날 근무를 패밀리데이로 바꿔주세요`;
}
function isFamilyDayCandidate(dateStr, group = currentGroup()){
  const [y,m] = dateStr.split('-').map(Number);
  return dateStr === familyDayStr(y, m-1, group);
}

/* ---------- 태그(특근/지근/지휴): 근무 위에 덧붙는 자동 태그 ----------
   지근 = 휴일(주말·공휴일) 근무 / 지휴 = 평일 휴무 (지근·지휴는 항상 1:1 — 적은 쪽 개수에 맞춰 가장 앞부터)
   특근 = 지근으로 못 쓴 잔여 휴일 근무
   연차·특휴·패밀리데이(leave:true)는 근무도 휴무도 아닌 '휴가' → 지근·지휴·특근 정산에서 완전히 제외.
     · 특휴를 휴일근무일에 쓰면 → 그 날이 휴일근무에서 빠져 지근이 다음 휴일근무일로 이동
     · 패밀리데이를 평일휴무일에 쓰면 → 지휴 짝이 하나 줄어 지근 하나가 특근으로 전환
   수동(groupDesig: 'TG'|'JG'|'JH'|'NONE')이 자동보다 우선 (단, 현재 근무에 적합할 때만) */
function desigMapFor(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupDesig) state.groupDesig = emptyGroupMap();
  if(!state.groupDesig[g]) state.groupDesig[g] = {};
  return state.groupDesig[g];
}
function isWorkerOff(dateStr, group){ const t = state.shiftTypes[shiftFor(dateStr, group)]; return !t || t.kind === 'off'; }
function isLeaveDay(dateStr, group){ const t = state.shiftTypes[shiftFor(dateStr, group)]; return !!(t && t.leave); } // 연차/특휴/패밀리데이 = 태그 정산 제외
function tgEligible(d, g){ return !isWorkerOff(d, g) && (isWeekend(d) || isHoliday(d)); } // 특근: 주말·공휴일 근무
function jgEligible(d, g){ return !isWorkerOff(d, g) && (isWeekend(d) || isHoliday(d)); } // 지근: 주말·공휴일 근무
function jhEligible(d, g){ return  isWorkerOff(d, g) && !isLeaveDay(d, g) && isWeekday(d) && !isHoliday(d); }  // 지휴: 평일 휴무(휴가 제외)
function desigEligible(tag, d, g){                                                        // 수동 태그가 현재 근무에 적합한지
  if(tag === 'TG') return tgEligible(d, g);
  if(tag === 'JG') return jgEligible(d, g);
  if(tag === 'JH') return jhEligible(d, g);
  return false;
}

function computeAutoTags(group, year, month){
  const ym = `${year}-${pad(month+1)}`;
  const dim = new Date(year, month+1, 0).getDate();
  const out = {};
  const holidayWork = [], weekdayOff = [];
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    const off = isWorkerOff(ds, group);
    if(!off && (isWeekend(ds) || isHoliday(ds))) holidayWork.push(ds); // 휴일(주말·공휴일) 근무
    if(off && !isLeaveDay(ds, group) && isWeekday(ds) && !isHoliday(ds)) weekdayOff.push(ds); // 평일 휴무(휴가 제외)
  }
  const N = Math.min(holidayWork.length, weekdayOff.length);   // 지근·지휴 1:1 → 적은 쪽 개수에 맞춤
  holidayWork.slice(0, N).forEach(ds => { out[ds] = 'JG'; });  // 지근 = 가장 앞 휴일근무부터 N개
  weekdayOff.slice(0, N).forEach(ds => { out[ds] = 'JH'; });   // 지휴 = 가장 앞 평일휴무부터 N개 (초과분은 무태그)
  holidayWork.slice(N).forEach(ds => { out[ds] = 'TG'; });     // 특근: 지근으로 못 쓴 나머지 휴일근무
  return out;
}
// 자동 + 수동(우선) 병합 후 지근·지휴를 다시 1:1로 맞추고 종류별 번호 부여 → { date: {tag, n} }
function tagsForMonth(group, year, month){
  if(isOfficeGroup(group)) return {};   // 오피스조는 평일 근무라 지근·지휴·특근 정산 대상이 아니다
  const ym = `${year}-${pad(month+1)}`;
  const dim = new Date(year, month+1, 0).getDate();
  const gd = desigMapFor(group);
  const auto = computeAutoTags(group, year, month);
  const merged = {};
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    let tag = auto[ds] || null;
    const man = gd[ds];
    if(man === 'NONE') tag = null;                            // 'NONE' = 이 날 태그 끔(억제 마커, 항상 유효)
    else if(man && desigEligible(man, ds, group)) tag = man;  // 수동 우선(현재 근무에 적합할 때만 · 부적격이면 자동값)
    if(tag && DESIG[tag]) merged[ds] = tag;
  }

  // 수동 태그나 특휴로 한쪽 개수만 달라져도 지근·지휴는 항상 1:1.
  // 초과분 제거 시 수동 지정일은 최대한 보존하고, 날짜가 늦은 자동 태그부터 조정한다.
  const jgDates = Object.keys(merged).filter(ds => merged[ds] === 'JG');
  const jhDates = Object.keys(merged).filter(ds => merged[ds] === 'JH');
  const pairCount = Math.min(jgDates.length, jhDates.length);
  function trimPaired(dates, tag, replacement){
    const excess = dates.length - pairCount;
    if(excess <= 0) return;
    const automatic = dates.filter(ds => gd[ds] !== tag).reverse();
    const manual = dates.filter(ds => gd[ds] === tag).reverse();
    automatic.concat(manual).slice(0, excess).forEach(ds => {
      if(replacement) merged[ds] = replacement;
      else delete merged[ds];
    });
  }
  trimPaired(jgDates, 'JG', 'TG'); // 초과 지근은 특근으로
  trimPaired(jhDates, 'JH', null); // 초과 지휴는 무태그로

  const counts = { TG:0, JG:0, JH:0 };
  const out = {};
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    const tag = merged[ds] || null;
    if(tag && DESIG[tag]){ counts[tag]++; out[ds] = { tag, n: counts[tag] }; }
  }
  return out;
}
function tagInfoFor(dateStr, group = currentGroup()){
  const [y, m] = dateStr.split('-').map(Number);
  return tagsForMonth(group, y, m-1)[dateStr] || null;
}
function tagLabel(ti){ return ti ? (DESIG[ti.tag].short + (ti.tag === 'TG' ? '' : ti.n)) : ''; }
function hexToTint(hex, alpha = 0.14){
  const h = (hex || '#000000').replace('#','');
  const r = parseInt(h.substring(0,2),16) || 0;
  const g = parseInt(h.substring(2,4),16) || 0;
  const b = parseInt(h.substring(4,6),16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}
function shortDateText(dateStr){
  const d = parseYmd(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}
function memoPreview(text, limit = 18){
  const s = String(text || '').trim();
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
}

/* ---------- 렌더링 ---------- */
const $ = (id) => document.getElementById(id);

function renderWeekdays(){
  $('weekdays').innerHTML = WEEK.map((w,i)=>
    `<div class="wd ${i===0?'sun':''} ${i===6?'sat':''}">${w}</div>`
  ).join('');
}

function themeMode(){
  const saved = document.documentElement.dataset.themeMode;
  return THEMES.some(t => t.key === saved) ? saved : 'auto';
}

function prefersDark(){
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme(){
  const mode = themeMode();
  const dark = mode === 'dark' || (mode === 'auto' && prefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

function selectTheme(mode){
  const next = THEMES.some(t => t.key === mode) ? mode : 'auto';
  document.documentElement.dataset.themeMode = next;
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme();
  renderThemePick();
}

function renderThemePick(){
  const box = $('setThemePick');
  if(!box) return;
  const mode = themeMode();
  box.innerHTML = THEMES.map(t =>
    `<button type="button" class="pick-theme${t.key===mode?' active':''}" data-theme-mode="${t.key}" aria-pressed="${t.key===mode}">
      <strong>${t.label}</strong><span>${t.note}</span>
    </button>`
  ).join('');
}

/* 머리글의 '내 조' 줄 — 다섯 조를 모두 왼쪽에 펼쳐 두고, 점 색으로 오늘 근무까지 알려 준다. */
function renderGroupBar(){
  const box = $('groupBarChips');
  if(!box) return;
  const today = todayStr();
  const selected = currentGroup();
  box.innerHTML = GROUPS.map(group=>{
    const t = st(shiftFor(today, group));
    const color = t ? t.color : '#94a3b8';
    const todayLabel = t ? t.label : '미설정';
    return `<button type="button" class="group-chip${group===selected?' active':''}" data-group="${group}" style="--c:${color}" aria-pressed="${group===selected}" title="${group}조 · 오늘 ${escapeHtml(todayLabel)}">
      <i aria-hidden="true"></i>${group}조
    </button>`;
  }).join('');
}

/* 탭에 맞는 영역만 남긴다. 비어 있는 영역(공휴일이 없는 달 등)은 data-tab-empty 로 알려 온다. */
function applyTab(){
  document.querySelectorAll('[data-tab-panel]').forEach(el=>{
    const mine = el.dataset.tabPanel === activeTab;
    el.hidden = !mine || el.dataset.tabEmpty === '1';
  });
  document.querySelectorAll('#tabbar [data-tab]').forEach(button=>{
    const on = button.dataset.tab === activeTab;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
}

function renderTeamBoard(){
  const el = $('teamBoard');
  if(!el) return;
  const today = todayStr();
  const todayDate = parseYmd(today);
  const todayLabel = `${todayDate.getMonth()+1}월 ${todayDate.getDate()}일 (${WEEK[todayDate.getDay()]})`;
  const selected = currentGroup();
  const items = GROUPS.map(group=>{
    const key = shiftFor(today, group);
    const t = st(key);
    const accent = t ? t.color : '#94a3b8';
    const shiftDay = shiftDayText(today, group);
    return `<button class="team-item${group===selected?' active':''}" data-group="${group}" style="--c:${accent}">
      <strong>${group}조</strong>
      <span class="team-shift">${t ? t.label : '미설정'}</span>
      <span class="team-day">${shiftDay}</span>
      ${group===selected ? `<span class="team-time" title="${escapeHtml(timeText(t))}">${escapeHtml(compactTime(t))}</span>` : ''}
    </button>`;
  }).join('');
  /* 펼침 여부는 class 하나로만 나타낸다. 접을 때 innerHTML을 다시 쓰면
     새로 그려진 칸이 이미 목표 높이라 전환이 보이지 않으므로, 두 상태의 글자를
     모두 넣어 두고 CSS로 하나만 보여 준다. 그래야 높이만 스르륵 움직인다. */
  const mine = st(shiftFor(today, selected));
  el.classList.toggle('collapsed', !teamBoardOpen);
  el.innerHTML = `
    <button class="team-head" id="teamToggle" type="button" aria-expanded="${teamBoardOpen}" aria-controls="teamGridWrap">
      <span class="team-head-main">
        <span class="th-long">${GROUPS.join('/')} 오늘 배치</span>
        <span class="th-short">오늘 배치</span>
        <em class="team-head-peek">${selected}조 · ${mine ? escapeHtml(mine.label) : '미설정'}</em>
      </span>
      <b>오늘 · ${todayLabel}</b>
      <span class="team-caret" aria-hidden="true">▾</span>
    </button>
    <div class="team-grid-wrap" id="teamGridWrap"><div class="team-grid">${items}</div></div>`;
}

function renderAllGroupsCalendar(){
  const grid = $('allGroupsGrid');
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const monthKey = `${view.year}-${pad(view.month+1)}`;
  const today = todayStr();
  const current = currentGroup();
  const tagMaps = Object.fromEntries(
    GROUPS.map(group => [group, tagsForMonth(group, view.year, view.month)])
  );

  const dateHeaders = Array.from({ length:daysInMonth }, (_, index)=>{
    const day = index + 1;
    const dateStr = `${monthKey}-${pad(day)}`;
    const dow = new Date(view.year, view.month, day).getDay();
    const hol = holidayName(dateStr);
    const dayClass = (hol || dow === 0) ? ' sun' : (dow === 6 ? ' sat' : '');
    const headTitle = hol ? ` title="${escapeHtml(hol)}"` : '';
    return `<div class="all-date-head${dayClass}${hol?' hol':''}${dateStr===today?' today':''}" data-date="${dateStr}"${headTitle}>
      <span>${day}</span><small>${hol ? escapeHtml(holidayShort(hol)) : WEEK[dow]}</small>
    </div>`;
  }).join('');

  const rows = GROUPS.map(group=>{
    const memos = memosFor(group);
    const cells = Array.from({ length:daysInMonth }, (_, index)=>{
      const day = index + 1;
      const dateStr = `${monthKey}-${pad(day)}`;
      const shift = st(shiftFor(dateStr, group));
      const color = shift ? shift.color : '#94a3b8';
      const label = shift ? (shift.short || shift.label) : '-';
      const tag = tagMaps[group][dateStr];
      const tagInfo = tag ? DESIG[tag.tag] : null;
      const memo = (memos[dateStr] || '').trim();
      return `<button class="all-group-cell${dateStr===today?' today':''}" data-group="${group}" data-date="${dateStr}" style="--c:${color}" aria-label="${group}조 ${day}일 ${escapeHtml(label)}">
        <span class="all-shift">${escapeHtml(label)}</span>
        ${tagInfo ? `<span class="all-tag" style="--tag:${tagInfo.color}">${tagInfo.short}</span>` : ''}
        ${memo ? `<span class="all-memo" title="${escapeHtml(memo)}">${escapeHtml(memoPreview(memo))}</span>` : ''}
      </button>`;
    }).join('');
    return `<button class="all-group-label${group===current?' active':''}" data-group="${group}" aria-label="${group}조를 내 조로 선택">${group}조</button>${cells}`;
  }).join('');

  grid.style.setProperty('--days', daysInMonth);
  grid.style.setProperty('--rows', GROUPS.length);
  grid.innerHTML = `<div class="all-groups-corner">조</div>${dateHeaders}${rows}`;

  requestAnimationFrame(()=>{
    const scroll = $('allGroupsScroll');
    const todayHead = grid.querySelector('.all-date-head.today');
    scroll.scrollLeft = todayHead ? Math.max(0, todayHead.offsetLeft - 125) : 0;
  });
}

/* 탭마다 다른 영역을 보여 주므로, 달을 옮길 때는 모든 탭의 내용을 함께 맞춰 둔다.
   예전처럼 보고 있는 쪽만 그리면 탭을 옮겼을 때 지난 달 내용이 남아 있었다. */
function renderCalendar(){
  const group = currentGroup();
  $('monthTitle').textContent = activeTab === 'groups'
    ? `${view.year}년 ${view.month+1}월 · 전체 ${GROUPS.length}개 조`
    : `${view.year}년 ${view.month+1}월 · ${group}조`;
  renderHolidayPanel();
  renderMonthGrid(group);
  renderMemoPanel();
  renderTodayCard();
  renderSummary();
  /* 가로 비교표는 보고 있을 때만 그린다 — 숨어 있으면 '오늘로 가로 스크롤'이 먹지 않는다. */
  if(activeTab === 'groups') renderAllGroupsCalendar();
  applyTab();
}

function renderMonthGrid(group){
  const startDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const todayS = todayStr();
  const rangeSet = sheetRange ? new Set(rangeDays(sheetRange.start, sheetRange.end)) : null;
  const memos = memosFor(group);
  const famHint = familyDayNote(group);
  const tagMap = tagsForMonth(group, view.year, view.month);
  const famDayStr = familyDayStr(view.year, view.month, group);
  let html = '';
  for(let i=0; i<startDow; i++) html += `<div class="cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const dow = new Date(view.year, view.month, d).getDay();
    const t = st(shiftFor(dateStr, group));
    const tint = t ? hexToTint(t.color) : 'transparent';
    const ti = tagMap[dateStr];
    const hasTag = !!ti;
    const tagHtml = ti
      ? `<span class="cell-tag" title="${tagLabel(ti)}" style="--tag:${DESIG[ti.tag].color}">${DESIG[ti.tag].short}</span>`
      : '';
    const badge = t
      ? `<span class="badge" style="--shift:${t.color}">${t.short || t.label}</span>`
      : `<span class="badge none">-</span>`;
    const hol = holidayName(dateStr);
    const dnumCls = (hol || dow===0) ? 'sun' : (dow===6 ? 'sat' : '');
    const holHtml = hol
      ? `<span class="cell-hol" title="${escapeHtml(hol)}">${escapeHtml(holidayShort(hol))}</span>`
      : '';
    const memo = memos[dateStr];
    const hasMemo = !!memo;
    const special = isSpecialSchedule(dateStr, group) && !isOverride(dateStr, group) && !isBaseline(dateStr, group);
    const longRun = workRunTotalFor(dateStr, group) >= 6;
    const selCls = `${rangeAnchor===dateStr ? ' range-anchor' : ''}${rangeSet && rangeSet.has(dateStr) ? ' range-sel' : ''}`;
    const isFam = dateStr === famDayStr;
    html += `<button class="cell ${dateStr===todayS?'today':''}${hasMemo?' has-memo':''}${hasTag?' has-tag':''}${hol?' is-holiday':''}${special?' is-special':''}${longRun?' long-run':''}${isFam?' is-familyday':''}${selCls}" data-date="${dateStr}" style="--tint:${tint}">
      <span class="cell-top"><span class="dnum ${dnumCls}">${d}</span>${holHtml}${tagHtml}${isFam ? `<span class="fam-mark" title="${escapeHtml(famHint)}">패데</span>` : ''}</span>
      ${badge}
      ${isOverride(dateStr, group) ? '<span class="dot-ov"></span>' : ''}
      ${memo ? `<span class="memo-pin" aria-hidden="true"></span><span class="cell-memo" title="${escapeHtml(memo)}">${escapeHtml(memo)}</span>` : '<span class="cell-memo-slot" aria-hidden="true"></span>'}
    </button>`;
  }
  const gridEl = $('grid');
  /* 5줄짜리 달은 6줄짜리와 같은 높이로 그리면 아래가 휑하게 남는다.
     그 달이 실제로 쓰는 줄 수를 넘겨, 남는 높이를 칸이 나눠 갖게 한다. */
  gridEl.style.setProperty('--rows', Math.ceil((startDow + daysInMonth) / 7));
  gridEl.innerHTML = html;
  syncMemoLines();
}

/* 칸에 들어가는 메모 줄 수 — 칸 높이를 재서 CSS에 알려 준다.
   2줄로 박아 두면 칸을 키워도 세 줄째부터 "…"로 잘렸다(사용자 신고 2026-11-28). */
function syncMemoLines(){
  const grid = $('grid');
  if(!grid) return;
  const probe = grid.querySelector('.cell-memo');
  if(!probe) return;
  const style = getComputedStyle(probe);
  const lineHeight = parseFloat(style.lineHeight);
  const inner = probe.clientHeight
    - (parseFloat(style.paddingTop) || 0)
    - (parseFloat(style.paddingBottom) || 0);
  if(!(lineHeight > 0) || !(inner > 0)) return;
  const lines = Math.max(1, Math.min(8, Math.floor(inner / lineHeight)));
  grid.style.setProperty('--memo-lines', String(lines));
}

/* 달력 칸은 좁아서 이름이 잘릴 수 있으니, 그 달 공휴일을 아래에 또렷하게 적어준다. */
function renderHolidayPanel(){
  const el = $('holidayPanel');
  if(!el) return;
  const items = holidaysInMonth(view.year, view.month);
  if(!items.length){ el.dataset.tabEmpty = '1'; el.hidden = true; el.innerHTML = ''; return; }
  const month = view.month + 1;
  el.dataset.tabEmpty = '0';
  el.innerHTML = `<span class="hol-title">🔴 이번 달 공휴일</span>` + items.map(h=>{
    const range = h.startDay === h.endDay ? `${month}/${h.startDay}` : `${month}/${h.startDay}~${h.endDay}`;
    return `<span class="hol-item"><b>${range}</b>${escapeHtml(h.name)}</span>`;
  }).join('');
}

function renderMemoPanel(){
  const el = $('memoPanel');
  if(!el) return;
  const group = currentGroup();
  const memos = memosFor(group);
  const ym = `${view.year}-${pad(view.month+1)}`;
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const items = [];
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${ym}-${pad(d)}`;
    const memo = (memos[dateStr] || '').trim();
    if(!memo) continue;
    const key = shiftFor(dateStr, group);
    const t = st(key);
    items.push({ dateStr, memo, shift: t });
  }

  const badge = $('memoTabBadge');
  if(badge){
    badge.textContent = String(items.length);
    badge.hidden = items.length === 0;
  }

  if(!items.length){
    el.innerHTML = `
      <div class="memo-panel-head">
        <div>
          <span class="memo-eyebrow">${group}조 메모</span>
          <h2>이번 달 체크할 일</h2>
        </div>
        <b>0개</b>
      </div>
      <div class="memo-empty">날짜를 누르면 메모를 바로 남길 수 있어요.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="memo-panel-head">
      <div>
        <span class="memo-eyebrow">${group}조 메모</span>
        <h2>이번 달 체크할 일</h2>
      </div>
      <b>${items.length}개</b>
    </div>
    <div class="memo-list">
      ${items.map(({ dateStr, memo, shift }) => {
        const color = shift ? shift.color : '#94a3b8';
        const label = shift ? (shift.short || shift.label) : '-';
        return `<button class="memo-item" data-date="${dateStr}" style="--c:${color}">
          <span class="memo-date">${shortDateText(dateStr)}</span>
          <span class="memo-shift">${label}</span>
          <span class="memo-text">${escapeHtml(memo)}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function renderLegend(){
  const shifts = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    if(!t) return '';
    return `<span class="lg"><span class="lg-dot" style="background:${t.color}"></span>${t.label}</span>`;
  }).join('');
  const marks = `
    <span class="lg lg-mark"><span class="lg-bar sun"></span>공휴일</span>
    <span class="lg lg-mark"><span class="lg-bar top"></span>명절 편성</span>
    <span class="lg lg-mark"><span class="lg-bar bottom"></span>6일+ 연속근무</span>`;
  $('legend').innerHTML = shifts + marks;
}

/* 교대근무 달력 앱들이 공통으로 두는 '다음 근무 · 다음 휴무'.
   오늘부터 넉 달 안에서 찾는다(그 안에 없으면 패턴이 비어 있는 경우다). */
function findNextDay(fromStr, group, wantWork){
  for(let i = 1; i <= 120; i++){
    const ds = addDays(fromStr, i);
    if(isWorkDay(ds, group) === wantWork) return { date: ds, days: i };
  }
  return null;
}

function renderTodayCard(){
  const el = $('todayCard');
  if(!el) return;
  const group = currentGroup();
  const today = todayStr();
  const t = st(shiftFor(today, group));
  const working = isWorkDay(today, group);
  const nextWork = findNextDay(today, group, true);
  const nextOff = findNextDay(today, group, false);
  const run = working ? workRunDayFor(today, group) : offRunDayFor(today, group);
  const runText = run > 1 ? ` · ${run}일차` : '';
  const line = (label, found, extra) => {
    if(!found) return '';
    const shift = extra ? st(shiftFor(found.date, group)) : null;
    return `<div class="tc-row">
      <span class="tc-key">${label}</span>
      <b>${shortDateText(found.date)}</b>
      <span class="tc-dday">D-${found.days}</span>
      ${shift ? `<em style="--c:${shift.color}">${escapeHtml(shift.label)}</em>` : ''}
    </div>`;
  };
  el.innerHTML = `
    <div class="tc-today" style="--c:${t ? t.color : '#94a3b8'}">
      <span class="tc-key">오늘 · ${shortDateText(today)}</span>
      <strong>${group}조 ${escapeHtml(t ? t.label : '미설정')}${runText}</strong>
      <span class="tc-time">${escapeHtml(timeText(t))}</span>
    </div>
    ${line('다음 근무', nextWork, true)}
    ${line('다음 휴무', nextOff, false)}`;
}

function renderSummary(){
  const group = currentGroup();
  const dim = new Date(view.year, view.month+1, 0).getDate();
  const tagMap = tagsForMonth(group, view.year, view.month);
  let work=0, off=0, jg=0, jh=0, teuk=0;
  for(let d=1; d<=dim; d++){
    const ds = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const t = state.shiftTypes[shiftFor(ds, group)];
    if(t && t.kind === 'work') work++; else off++;
    const ti = tagMap[ds];
    if(ti){ if(ti.tag === 'TG') teuk++; else if(ti.tag === 'JG') jg++; else if(ti.tag === 'JH') jh++; }
  }
  const parts = [
    `<span class="sm sm-group">${group}조</span>`,
    `<span class="sm sm-work">근무 <b>${work}</b></span>`,
    `<span class="sm sm-off">휴무 <b>${off}</b></span>`,
  ];
  if(!isOfficeGroup(group)){   // 오피스조는 지근·지휴·특근이 생기지 않는다
    parts.push(
      `<span class="sm sm-teuk">특근 <b>${teuk}</b></span>`,
      `<span class="sm sm-jg">지근 <b>${jg}</b></span>`,
      `<span class="sm sm-jh">지휴 <b>${jh}</b></span>`);
  }
  $('summary').innerHTML = parts.join('');
}

/* ---------- Android 홈 화면 위젯 연결 ----------
   네이티브 앱의 WebView가 제공하는 AndroidWidget 브리지에 달력 스냅샷을 전달합니다.
   브라우저/PWA에서는 브리지가 없으므로 아무 작업도 하지 않습니다. */
let teamBoardOpen = (()=>{
  try{ return localStorage.getItem(TEAM_BOARD_KEY) !== 'closed'; }catch(e){ return true; }
})();
function toggleTeamBoard(){
  teamBoardOpen = !teamBoardOpen;
  try{ localStorage.setItem(TEAM_BOARD_KEY, teamBoardOpen ? 'open' : 'closed'); }catch(e){}
  /* 다시 그리지 않고 클래스만 바꾼다 — 같은 칸이 그대로 남아야 높이가 움직인다. */
  const el = $('teamBoard');
  if(!el) return;
  el.classList.toggle('collapsed', !teamBoardOpen);
  const toggle = $('teamToggle');
  if(toggle) toggle.setAttribute('aria-expanded', String(teamBoardOpen));
  const wrap = $('teamGridWrap');
  if(wrap) wrap.setAttribute('aria-hidden', String(!teamBoardOpen));
}

let androidWidgetTimer = null;
function widgetMemo(value){
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function buildAndroidWidgetPayload(referenceDate = new Date()){
  const currentYear = referenceDate.getFullYear();
  const firstYear = Math.min(2026, currentYear - 1);
  const lastYear = Math.max(2027, currentYear + 2);
  const shifts = {};
  for(const [key, type] of Object.entries(state.shiftTypes)){
    shifts[key] = {
      label: type.label || key,
      short: type.short || type.label || key,
      start: type.start || '',
      end: type.end || '',
      color: type.color || '#94a3b8',
      kind: type.kind || 'work',
    };
  }

  const months = {};
  for(let year = firstYear; year <= lastYear; year++){
    for(let month = 0; month < 12; month++){
      const monthKey = `${year}-${pad(month+1)}`;
      const daysInMonth = new Date(year, month+1, 0).getDate();
      const groups = {};
      for(const group of GROUPS){
        const tagMap = tagsForMonth(group, year, month);
        const memos = memosFor(group);
        const days = [];
        for(let day = 1; day <= daysInMonth; day++){
          const dateStr = `${monthKey}-${pad(day)}`;
          const tag = tagMap[dateStr];
          days.push([
            shiftFor(dateStr, group) || '',
            tag ? tag.tag : '',
            tag ? tag.n : 0,
            widgetMemo(memos[dateStr]),
            isHoliday(dateStr) ? 1 : 0,
          ]);
        }
        groups[group] = days;
      }
      months[monthKey] = groups;
    }
  }

  return {
    schema: 2,
    generatedAt: Date.now(),
    activeGroup: currentGroup(),
    firstYear,
    lastYear,
    shifts,
    months,
  };
}

function publishAndroidWidgetSnapshot(){
  const bridge = window.AndroidWidget;
  if(!bridge || typeof bridge.updateCalendar !== 'function') return;
  try{
    bridge.updateCalendar(JSON.stringify(buildAndroidWidgetPayload()));
  }catch(error){
    console.warn('Android 위젯 갱신 실패', error);
  }
}

function queueAndroidWidgetSnapshot(){
  if(!window.AndroidWidget || typeof window.AndroidWidget.updateCalendar !== 'function') return;
  clearTimeout(androidWidgetTimer);
  androidWidgetTimer = setTimeout(publishAndroidWidgetSnapshot, 250);
}
window.publishAndroidWidgetSnapshot = publishAndroidWidgetSnapshot;

function renderAll(){
  renderGroupBar();
  renderTeamBoard();
  renderCalendar();
  renderLegend();
  queueAndroidWidgetSnapshot();
}

/* ---------- 범위(여러 날) 선택 ---------- */
function rangeDays(a, b){
  let s = a, e = b;
  if(dayDiff(a, b) < 0){ s = b; e = a; }
  const out = [], n = dayDiff(s, e), start = parseYmd(s);
  for(let i=0; i<=n; i++){ const d = new Date(start); d.setDate(d.getDate()+i); out.push(ymd(d)); }
  return out;
}
function startRange(dateStr){
  if(!canEdit()) return;
  rangeAnchor = dateStr;
  const d = parseYmd(dateStr);
  $('rangeBannerText').textContent = `시작 ${d.getMonth()+1}/${d.getDate()} — 끝 날짜를 탭하세요`;
  $('rangeBanner').hidden = false;
  renderCalendar();
}
function hideRangeBanner(){ rangeAnchor = null; $('rangeBanner').hidden = true; }
/* 기간 되돌리기: 수동 변경과 메모를 함께 지운다.
   메모는 공유방에도 '지웠다'(빈 값)고 알려야 한다 — 안 그러면 클라우드의 sharedMemos에 값이 남아
   바로 다음 동기화 때 지운 메모가 그대로 되살아난다. 하루짜리 삭제는 saveMemoValue가 이미 이렇게 한다.
   원래 메모가 없던 날까지 빈 값을 올리면 클라우드에 쓸데없는 필드만 쌓이므로 건너뛴다. */
function clearRange(group, days){
  const ov = groupOverrideMap(group), mm = memosFor(group);
  days.forEach(ds=>{
    delete ov[ds];
    if(mm[ds] === undefined) return;
    delete mm[ds];
    if(window.Sync && Sync.saveMemo) Sync.saveMemo(group, ds, '');
  });
}

function openRangeSheet(a, b){
  selectedDate = null;
  sheetRange = { start: a, end: b };
  const group = currentGroup();
  const days = rangeDays(a, b);
  const s = parseYmd(days[0]), e = parseYmd(days[days.length-1]);
  /* 하루짜리 날짜 시트와 똑같이 보기 전용을 따른다.
     예전엔 여기에 이 처리가 없어서, 공유받은 사람도 기간을 잡으면 근무 목록과
     '지우기' 버튼이 그대로 열려 자기 화면의 근무표를 지울 수 있었다. */
  const ro = !canEdit();
  const memoWritable = canEditMemo();
  $('daySheet').classList.toggle('sheet-ro', ro);
  $('sheetDate').textContent = `${s.getMonth()+1}월 ${s.getDate()}일 ~ ${e.getMonth()+1}월 ${e.getDate()}일 · ${days.length}일 · ${group}조`;
  $('sheetHoliday').hidden = true;
  document.querySelector('.sheet-hint').innerHTML = ro
    ? `👀 공유 화면이라 근무표는 바꿀 수 없어요. <b>메모는 ${days.length}일에 한꺼번에</b> 남길 수 있어요.`
    : `선택한 <b>${days.length}일</b>에 한꺼번에 적용돼요. (지근/지휴는 가능한 날에만)`;
  $('sheetOptions').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    const anyValid = !ro && days.some(ds => canPlace(key, ds, group));
    return `<button class="opt ${anyValid?'':'opt-disabled'}" data-code="${key}" ${anyValid?'':'disabled'} style="--c:${t.color}">
      <span class="opt-badge" style="background:${t.color}">${t.short || t.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${t.label}</span>
      <span class="opt-time">${timeText(t)}</span></span>
    </button>`;
  }).join('');
  $('sheetDesig').hidden = true;
  $('sheetMemo').value = '';
  $('sheetMemo').readOnly = !memoWritable;
  $('sheetMemo').placeholder = ro ? '함께 볼 메모를 남겨보세요' : '예: 교육, 비번, 연차…';
  $('memoPresets').hidden = !memoWritable;
  $('memoEditor').style.display = memoWritable ? '' : 'none';
  $('memoEditor').classList.toggle('memo-shared', ro && memoWritable);
  updateMemoCount('');
  $('btnRevert').textContent = '↺ 이 기간 수동변경·메모 지우기';
  $('btnRevert').hidden = ro;
  $('dayBackdrop').hidden = false;
  $('daySheet').hidden = false;
}

/* ---------- 날짜 편집 시트 ---------- */
function openDaySheet(dateStr){
  selectedDate = dateStr;
  sheetRange = null;
  const group = currentGroup();
  const d = parseYmd(dateStr);
  $('sheetDate').textContent = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${WEEK[d.getDay()]}) · ${group}조`;
  const hol = holidayName(dateStr);
  const ti = tagInfoFor(dateStr, group);
  const sh = $('sheetHoliday');
  const infoParts = [];
  if(hol) infoParts.push(`<span class="sh-hol">🔴 ${escapeHtml(hol)}</span>`);
  if(isSpecialSchedule(dateStr, group) && !isOverride(dateStr, group) && !isBaseline(dateStr, group)) infoParts.push('<span class="sh-special">🎎 명절 편성</span>');
  const runTotal = workRunTotalFor(dateStr, group);
  if(runTotal >= 6) infoParts.push(`<span class="sh-run">🔺 ${runTotal}일 연속근무 (오늘 ${workRunDayFor(dateStr, group)}일차)</span>`);
  if(ti) infoParts.push(`<b>${tagLabel(ti)}</b>`);
  if(isFamilyDayCandidate(dateStr, group)) infoParts.push(`<span class="sh-fam">${familyDayNote(group)}</span>`);
  if(infoParts.length){ sh.hidden = false; sh.innerHTML = infoParts.join(' '); }
  else { sh.hidden = true; sh.innerHTML = ''; }
  const ro = !canEdit();
  const memoWritable = canEditMemo();
  const current = shiftFor(dateStr, group);
  $('daySheet').classList.toggle('sheet-ro', ro);
  /* 오피스조엔 '패턴'이 없다. 조사가 붙는 자리라 문장별로 다른 말을 쓴다. */
  const office = isOfficeGroup(group);
  const baseWord   = office ? '오피스조 기본값' : '패턴';      // "~과 다르게 바꾸면"
  const revertWord = office ? '오피스조 기본값' : '패턴 값';   // "~으로 되돌리기"
  document.querySelector('.sheet-hint').innerHTML = ro
    ? '👀 공유 화면입니다. 근무표는 보기 전용이고 <b>메모는 함께 작성</b>할 수 있어요.'
    : `이 날의 근무를 선택하세요. (${baseWord}과 다르게 바꾸면 <b>수동 변경</b>으로 표시)`;
  $('sheetOptions').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    const allowed = !ro && canPlace(key, dateStr, group);
    const note = ro ? timeText(t) : (allowed ? timeText(t) : (t.special === 'desigOff' ? '근무일에만' : '휴무일에만'));
    const disabled = ro || !allowed;
    return `<button class="opt ${key===current?'selected':''} ${disabled?'opt-disabled':''}" data-code="${key}" ${disabled?'disabled':''} style="--c:${t.color}">
      <span class="opt-badge" style="background:${t.color}">${t.short || t.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${t.label}</span>
      <span class="opt-time">${note}</span></span>
    </button>`;
  }).join('');
  if(ro || isOfficeGroup(group)){ $('sheetDesig').hidden = true; }
  else { renderSheetDesig(dateStr, group); }
  const memoText = memosFor(group)[dateStr] || '';
  /* 값이 같은데도 다시 넣으면 커서가 글 끝으로 튄다 — 달라졌을 때만 바꾼다. */
  const memoBox = $('sheetMemo');
  if(memoBox.value !== memoText) memoBox.value = memoText;
  $('sheetMemo').readOnly = !memoWritable;
  $('sheetMemo').placeholder = ro ? '함께 볼 메모를 남겨보세요' : '예: 교육, 비번, 연차…';
  $('memoPresets').hidden = !memoWritable;
  $('memoEditor').style.display = (!memoWritable && !memoText) ? 'none' : '';
  $('memoEditor').classList.toggle('memo-shared', ro && memoWritable);
  updateMemoCount(memoText);
  $('btnRevert').textContent = isBaseline(dateStr, group)
    ? '↺ 확정된 기본값으로 되돌리기'
    : `↺ ${revertWord}으로 되돌리기`;
  $('btnRevert').hidden = ro || !isOverride(dateStr, group);
  $('dayBackdrop').hidden = false;
  $('daySheet').hidden = false;
}
function closeDaySheet(){
  $('dayBackdrop').hidden = true;
  $('daySheet').hidden = true;
  selectedDate = null;
  sheetRange = null;
  renderAll();
}
function setShift(key){
  if(!canEdit()) return;
  const group = currentGroup();
  if(sheetRange){  // 범위 모드: 기간 내 모든 날에 적용(가능한 날만)
    const overrides = groupOverrideMap(group);
    rangeDays(sheetRange.start, sheetRange.end).forEach(ds=>{
      if(!canPlace(key, ds, group)) return;
      if(key === groupShiftFor(ds, group)) delete overrides[ds];
      else overrides[ds] = key;
    });
    saveState();
    renderCalendar(); renderTeamBoard();
    openRangeSheet(sheetRange.start, sheetRange.end);
    return;
  }
  if(!selectedDate) return;
  if(!canPlace(key, selectedDate, group)) return;  // 못 넣는 자리 차단
  const overrides = groupOverrideMap(group);
  if(key === groupShiftFor(selectedDate, group)) delete overrides[selectedDate];
  else overrides[selectedDate] = key;
  saveState();
  openDaySheet(selectedDate);
  renderCalendar();
  renderTeamBoard();
}

function renderSheetDesig(dateStr, group){
  const el = $('sheetDesig');
  el.hidden = false;
  const ti = tagInfoFor(dateStr, group);
  const cur = ti ? ti.tag : null;
  const tgOk = tgEligible(dateStr, group), jgOk = jgEligible(dateStr, group), jhOk = jhEligible(dateStr, group);
  el.innerHTML = `
    <div class="desig-label">태그 (자동 계산 · 직접 바꾸기)</div>
    <div class="desig-opts four">
      <button class="desig-opt ${!cur?'sel':''}" data-desig="">없음</button>
      <button class="desig-opt tg ${cur==='TG'?'sel':''}" data-desig="TG" ${tgOk?'':'disabled'}>특근</button>
      <button class="desig-opt jg ${cur==='JG'?'sel':''}" data-desig="JG" ${jgOk?'':'disabled'}>지근</button>
      <button class="desig-opt jh ${cur==='JH'?'sel':''}" data-desig="JH" ${jhOk?'':'disabled'}>지휴</button>
    </div>
    <div class="desig-hint">지근=휴일(주말·공휴일) 근무 / 지휴=평일 휴무(지근과 1:1) / 특근=잔여 휴일 근무 · 연차·특휴·패밀리데이는 태그 정산 제외</div>`;
}
function setDesig(tag){
  if(!canEdit()) return;
  if(!selectedDate) return;
  const group = currentGroup();
  if(tag === 'TG' && !tgEligible(selectedDate, group)) return;
  if(tag === 'JG' && !jgEligible(selectedDate, group)) return;
  if(tag === 'JH' && !jhEligible(selectedDate, group)) return;
  const gd = desigMapFor(group);
  if(tag === '') gd[selectedDate] = 'NONE';  // 없음 = 이 날 태그 끔(자동도)
  else gd[selectedDate] = tag;
  saveState();
  openDaySheet(selectedDate);
  renderCalendar(); renderTeamBoard();
}

// 특근/지근/지휴는 전부 자동 계산 (개수 입력칸 제거)

function updateMemoCount(value = $('sheetMemo').value){
  const el = $('memoCount');
  if(!el) return;
  el.textContent = `${String(value || '').length}/80`;
}

function saveMemoValue(value){
  if(!canEditMemo()) return;
  const v = String(value || '').trim();
  const group = currentGroup();
  const memos = memosFor(group);
  if(sheetRange){
    rangeDays(sheetRange.start, sheetRange.end).forEach(ds=>{
      if(v) memos[ds]=v; else delete memos[ds];
      if(window.Sync && Sync.saveMemo) Sync.saveMemo(group, ds, v);
    });
    saveState(false); renderCalendar();
    return;
  }
  if(!selectedDate) return;
  if(v) memos[selectedDate] = v; else delete memos[selectedDate];
  if(window.Sync && Sync.saveMemo) Sync.saveMemo(group, selectedDate, v);
  saveState(false); renderCalendar();
}

/* ---------- 설정: 근무 종류 ---------- */
/* 설정의 '내 조' — 머리글 줄과 같은 값을 고르지만, 조마다 설명을 한 줄 붙여 준다. */
function renderGroupPick(){
  const box = $('setGroupPick');
  if(!box) return;
  const selected = currentGroup();
  const today = todayStr();
  box.innerHTML = GROUPS.map(group=>{
    const t = st(shiftFor(today, group));
    const note = group === OFFICE_GROUP ? '오피스 · 월~금' : '4조 3교대';
    return `<button type="button" class="pick-group${group===selected?' active':''}" data-group="${group}" aria-pressed="${group===selected}">
      <strong>${group}조</strong>
      <span>${note}</span>
      <em style="--c:${t ? t.color : '#94a3b8'}">오늘 ${escapeHtml(t ? t.label : '미설정')}</em>
    </button>`;
  }).join('');
}

function renderSettings(){
  renderThemePick();
  renderGroupPick();
  $('setShiftTypes').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    return `<div class="st-card" data-code="${key}">
      <div class="st-line1">
        <input class="st-color" type="color" value="${t.color}" data-field="color" />
        <input class="st-short" type="text" value="${t.short}" data-field="short" maxlength="3" placeholder="D" title="달력 뱃지" />
        <input class="st-label" type="text" value="${t.label}" data-field="label" maxlength="8" placeholder="이름" />
        <button class="st-del" data-del="${key}" aria-label="삭제" title="삭제">🗑</button>
      </div>
      <div class="st-line2">
        <input class="st-time" type="time" value="${t.start}" data-field="start" />
        <span class="st-sep">~</span>
        <input class="st-time" type="time" value="${t.end}" data-field="end" />
        <label class="st-kind"><input type="checkbox" data-field="kindoff" ${t.kind==='off'?'checked':''}/> 휴무</label>
      </div>
    </div>`;
  }).join('') + `<button class="add-type-btn" id="btnAddType">＋ 근무 종류 추가</button>`;
  renderPatternChips();
  renderPatternAdd();
  $('startDate').value = state.pattern.startDate;
  renderBaselineBox();
  renderSyncBox();
}

/* ---------- 설정: 수동 변경 → 기본 확정 ---------- */
// 현재 조의 '수동 변경(빨간 네모)' 개수
function overrideCount(group = currentGroup()){
  const ov = groupOverrideMap(group);
  let n = 0;
  for(const dt in ov){ if(state.shiftTypes[ov[dt]]) n++; }
  return n;
}
function renderBaselineBox(){
  const box = $('baselineBox');
  if(!box) return;
  const group = currentGroup();
  const n = overrideCount(group);
  if(n === 0){
    box.innerHTML = `<p class="baseline-empty">지금 <b>${group}조</b>에 직접 바꾼 날(빨간 네모)이 없어요. 달력에서 근무를 바꾸면 여기서 기본으로 확정할 수 있습니다.</p>`;
    return;
  }
  box.innerHTML = `
    <p class="baseline-count"><b>${group}조</b>에 직접 바꾼 날이 <b>${n}일</b> 있어요.</p>
    <button class="btn-primary" id="baselineConfirmBtn">✅ ${group}조 수동 변경 ${n}일을 기본으로 확정</button>`;
}
// 현재 조의 수동 변경을 '확정된 기본 근무'로 옮겨 빨간 네모를 없앤다(값은 그대로).
function confirmOverridesToBaseline(group = currentGroup()){
  if(!canEdit()) return;
  const g = normalizeGroup(group);
  const n = overrideCount(g);
  if(n === 0) return;
  if(!confirm(`${g}조에서 직접 바꾼 ${n}일을 '기본 근무표'로 확정할까요?\n빨간 네모 표시가 사라지고, 바꾼 값은 그대로 유지됩니다. (나중에 다시 바꿀 수 있어요)`)) return;
  const overrides = groupOverrideMap(g);
  const baseline = groupBaselineMap(g);
  for(const dt in overrides){
    if(state.shiftTypes[overrides[dt]]) baseline[dt] = overrides[dt];
    delete overrides[dt];
  }
  saveState();
  renderSettings();
  renderAll();
}

/* ---------- 설정: 친구와 공유(실시간 동기화) ---------- */
const FIRESTORE_RULES =
`rules_version = '2';
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

      match /participants/{uid} {
        function calendar() {
          return get(/databases/$(database)/documents/calendars/$(code));
        }
        function isCalendarMember() {
          return request.auth != null
            && request.auth.uid in calendar().data.memberUids;
        }
        function validProfile() {
          return request.resource.data.keys()
              .hasOnly(['name', 'role', 'joinedAt', 'updatedAt'])
            && request.resource.data.name is string
            && request.resource.data.name.size() >= 1
            && request.resource.data.name.size() <= 20
            && request.resource.data.joinedAt is int
            && request.resource.data.updatedAt is int
            && ((request.auth.uid == calendar().data.ownerUid
                  && request.resource.data.role == 'owner')
              || (request.auth.uid != calendar().data.ownerUid
                  && request.resource.data.role == 'viewer'));
        }

        allow read: if isCalendarMember();
        allow create, update: if isCalendarMember()
          && request.auth.uid == uid
          && validProfile();
        allow delete: if request.auth != null
          && (request.auth.uid == uid
            || request.auth.uid == calendar().data.ownerUid);
      }
    }
  }
}`;

function syncStatusText(s){
  return ({ connecting:'⏳ 연결 중…', live:'🟢 실시간 공유 중', readonly:'💬 공유 연결됨 · 메모 작성 가능', removed:'🚪 공유방에서 나가졌습니다', error:'⚠️ 오류', off:'꺼짐' })[s] || s;
}

// 입력 중인 이름 — 공유 상태가 갱신돼도 타이핑하던 값이 날아가지 않게 잠시 들고 있습니다.
let nameDraft = null;

function androidBridge(){
  return window.AndroidWidget || null;
}

function myDisplayName(){
  return (window.Sync && Sync.profileName) ? Sync.profileName() : '';
}

/* 공유방에 표시할 이름은 로그인 없이 직접 입력합니다. */
function renderNameCard(){
  const name = myDisplayName();
  const value = nameDraft === null ? name : nameDraft;
  return `<div class="name-card${name ? ' set' : ''}">
    <div class="name-card-head">
      ${name ? `<span class="name-avatar" aria-hidden="true">${escapeHtml(name.slice(0,1))}</span>` : ''}
      <div>
        <strong>${name ? '공유방에 표시될 내 이름' : '내 이름 정하기'}</strong>
        <p>${name
          ? '참여자 목록과 초대 문구에 이 이름으로 표시돼요.'
          : '참여자 목록과 초대 문구에 표시할 이름이에요. 별명도 괜찮아요.'}</p>
      </div>
    </div>
    <div class="name-input-row">
      <input id="syncNameInput" class="name-input" type="text" maxlength="20"
        placeholder="예: 홍길동" autocomplete="nickname" value="${escapeHtml(value)}" />
      <button class="btn-primary" id="syncNameSave">저장</button>
    </div>
    ${name ? '<button class="btn-text-danger" id="syncNameClear">이름 지우기</button>' : ''}
  </div>`;
}

function renderParticipantNames(){
  if(!window.Sync || !Sync.isOn()) return '';
  const people = Sync.participants ? Sync.participants() : [];
  const status = Sync.getStatus ? Sync.getStatus() : {};
  /* 방장만 내보낼 수 있고, 자기 자신은 못 내보냅니다. */
  const canRemove = !!(Sync.canRemoveMembers && Sync.canRemoveMembers());
  const ownerMissing = Sync.ownerNamed ? !Sync.ownerNamed() : false;

  const rows = people.map(person=>{
    const badge = person.isOwner ? '<b class="role owner">방장</b>' : '<b class="role">참여자</b>';
    const me = person.isMe ? '<span class="me">나</span>' : '';
    const kick = (canRemove && !person.isOwner && !person.isMe)
      ? `<button type="button" class="participant-kick" data-kick="${escapeHtml(person.uid)}"
           data-name="${escapeHtml(person.name)}" aria-label="${escapeHtml(person.name)} 내보내기">✕</button>`
      : '';
    return `<li class="participant-row${person.isOwner ? ' owner' : ''}">
      <i class="participant-avatar">${escapeHtml(person.name.slice(0,1))}</i>
      <span class="participant-name">${escapeHtml(person.name)}${me}</span>
      ${badge}${kick}
    </li>`;
  }).join('');

  const list = people.length
    ? `<ul class="participant-list">${rows}</ul>`
    : '<p class="participant-empty">이름을 정한 참여자가 여기에 표시됩니다.</p>';

  /* 이름 없이 들어온 사람은 목록에 안 뜹니다. 그래도 방장은 알고 있어야 합니다. */
  const unnamed = Sync.unnamedMembers ? Sync.unnamedMembers() : 0;
  const total = people.length + unnamed;

  return `<div class="participants-card">
    <div class="participants-title"><strong>공유방 참여자</strong><span>${total}명</span></div>
    ${list}
    ${unnamed > 0
      ? `<p class="participant-unnamed">이름을 정하지 않은 참여자 <b>${unnamed}명</b>이 근무표를 보고 있습니다. 이름을 정하면 위 목록에 나타납니다.</p>`
      : ''}
    ${ownerMissing ? '<p class="participant-note">방장이 아직 이름을 정하지 않아 목록에 표시되지 않습니다.</p>' : ''}
    ${canRemove && people.length > 1 ? '<p class="participant-note">✕ 를 누르면 그 사람은 근무표를 더 이상 볼 수 없습니다.</p>' : ''}
    ${status.participantError ? `<p class="kakao-login-error">이름 동기화 오류 · ${escapeHtml(status.participantError)}</p>` : ''}
  </div>`;
}

/*
 * 방장에게 보여 주는 초대 코드입니다.
 * 8자리는 새로 만든 방에만 붙습니다. 예전 방의 코드를 바꾸면 이미 들어온 참여자가
 * 끊기므로 그대로 두고, 대신 화면이 거짓말하지 않도록 문구와 크기를 길이에 맞춥니다.
 */
function renderInviteCode(){
  const code = Sync.code ? Sync.code() : '';
  const shown = Sync.displayCode ? Sync.displayCode() : code;
  const legacy = code.length > 8;
  return `<div class="code-card${legacy ? ' long' : ''}">
    <span class="code-label">초대 코드</span>
    <b class="code-value" id="syncCodeValue">${escapeHtml(shown)}</b>
    <button class="btn-soft sm" id="syncCodeCopy">복사</button>
  </div>
  <p class="code-help">친구가 <b>설정 › 친구와 공유하기</b>에서 이 코드를 넣으면 바로 연결됩니다. 링크가 앱에서 안 열릴 때 확실한 방법이에요.${
    legacy
      ? ' <br><b>이 방은 예전에 만들어 코드가 깁니다.</b> 짧은 8자리로 바꾸려면 아래 <b>공유방 닫기</b> 후 다시 만드세요. 지금 들어와 있는 분들은 새 코드로 다시 참여해야 합니다.'
      : ''
  }</p>`;
}

/*
 * 초대 코드로 참여하는 칸입니다.
 * 링크는 카톡 인앱 브라우저·주소창 붙여넣기처럼 앱으로 넘어오지 못하는 경로가 많습니다.
 * 코드는 그런 경로와 무관하게 항상 동작하므로 링크와 함께 열어 둡니다.
 */
function renderJoinByCode(){
  const named = !!myDisplayName();
  return `<div class="join-card">
    <strong>초대 코드를 받으셨나요?</strong>
    <p>친구가 알려 준 코드를 넣으면 바로 연결됩니다. 링크가 앱에서 안 열릴 때도 이 방법은 됩니다.</p>
    ${named ? '' : '<p class="join-need-name">⚠️ <b>먼저 위에서 내 이름을 정해 주세요.</b> 이름이 없으면 방장 화면에 내가 안 보입니다.</p>'}
    <div class="join-row">
      <input id="syncJoinInput" class="join-input" type="text" maxlength="24"
        placeholder="예: abcd-efgh" autocomplete="off" autocapitalize="none" spellcheck="false" />
      <button class="btn-primary" id="syncJoinBtn">참여</button>
    </div>
    <div class="sync-msg" id="syncJoinMsg"></div>
  </div>`;
}

async function joinByInviteCode(btn){
  const input = $('syncJoinInput');
  const msg = $('syncJoinMsg');
  const code = input ? input.value : '';
  /*
   * 이름 없이 들어가면 참여자 문서를 못 만들어(규칙상 이름이 필수)
   * 방장 목록에 안 뜹니다. 근무표는 보이는데 방장만 모르는 상태가 되므로 먼저 막습니다.
   */
  if(!myDisplayName()){
    if(msg){ msg.className = 'sync-msg err'; msg.textContent = '먼저 위에서 내 이름을 정하고 저장해 주세요. 이름이 있어야 방장에게 내가 보입니다.'; }
    const nameInput = $('syncNameInput');
    if(nameInput){
      nameInput.scrollIntoView({ block:'center', behavior:'smooth' });
      nameInput.focus();
    }
    return;
  }
  if(!code.trim()){
    if(msg){ msg.className = 'sync-msg err'; msg.textContent = '초대 코드를 입력해 주세요.'; }
    return;
  }
  if(btn) btn.disabled = true;
  if(msg){ msg.className = 'sync-msg'; msg.textContent = '연결 중…'; }
  try{
    await Sync.joinByCode(code);
    renderSyncBox();
    renderAll();
  }catch(e){
    if(btn) btn.disabled = false;
    if(msg){ msg.className = 'sync-msg err'; msg.textContent = e && e.message ? e.message : String(e); }
  }
}

/* 내보내기는 되돌릴 수 없습니다(다시 초대 링크를 보내야 함). 반드시 한 번 묻습니다. */
function kickParticipant(uid, name){
  if(!window.Sync || !Sync.removeMember) return;
  if(!confirm(`${name}님을 공유방에서 내보낼까요?\n\n내보내면 근무표와 메모를 더 이상 볼 수 없습니다.\n다시 들어오려면 초대 링크를 새로 보내야 합니다.`)) return;
  Sync.removeMember(uid)
    .then(()=>{ renderSyncBox(); })
    .catch(err=>{
      alert('내보내지 못했습니다.\n' + (err && err.message ? err.message : err));
      renderSyncBox();
    });
}

function saveDisplayName(value){
  if(!window.Sync || !Sync.setProfile) return;
  const name = String(value || '').trim().slice(0,20);
  nameDraft = null;
  const done = name ? Sync.setProfile(name) : Sync.clearProfile();
  Promise.resolve(done).catch(()=>{}).then(()=>{ renderSyncBox(); });
}

// 상대 시각: '방금 전' · 'N분 전' · 'N시간 전' · 'N일 전' · 날짜
function relTime(ms){
  if(!ms) return '';
  const diff = Date.now() - Number(ms);
  if(diff < 45000) return '방금 전';
  const min = Math.floor(diff / 60000);
  if(min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if(hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if(day < 7) return `${day}일 전`;
  const d = new Date(Number(ms));
  return `${d.getMonth()+1}월 ${d.getDate()}일`;
}

// 공유 링크 QR 코드 그리기(오프라인 생성). 링크가 너무 길면 조용히 생략.
function renderShareQr(link){
  const el = $('syncQr');
  if(!el) return;
  if(!window.QRCode || !link){ el.hidden = true; return; }
  try{
    el.innerHTML = QRCode.svg(link, { ecl:'M', border:2, dark:'#111827', light:'#ffffff' });
    el.hidden = false;
  }catch(e){ el.hidden = true; }
}

// Android 앱은 카카오톡을 바로 열고, PWA는 운영체제 공유창 또는 링크 복사를 사용합니다.
function shareSyncLink(btn){
  const link = Sync.shareLink();
  if(!link) return;
  const sender = myDisplayName();
  const title = sender ? `${sender}님의 교대캘린더 초대` : '교대캘린더 친구 초대';
  const text = sender
    ? `${sender}님의 근무표를 같이 볼 수 있어요. 날짜별 메모도 함께 남겨보세요.`
    : '내 근무표를 같이 볼 수 있어요. 날짜별 메모도 함께 남겨보세요.';
  const bridge = window.AndroidWidget;
  if(bridge && typeof bridge.shareToKakao === 'function'){
    bridge.shareToKakao(title, text, link);
  }else if(navigator.share){
    navigator.share({ title, text, url:link })
      .catch(()=>{});
  }else{
    copyToClipboard(link, btn);
  }
}

function renderSyncBox(){
  const box = $('syncBox');
  if(!box || !window.Sync) return;
  const st = Sync.getStatus();
  if(Sync.role() === 'viewer'){
    const last = st.updatedAt;
    /* 방장이 내보낸 경우입니다. 설정 오류로 오해하지 않도록 따로 안내합니다. */
    if(st.status === 'removed'){
      box.innerHTML = `
        <div class="sync-status err">${syncStatusText(st.status)}</div>
        <p class="sync-note">방장이 이 공유방에서 나를 내보냈습니다. 마지막으로 받은 근무표는 이 기기에 남아 있지만 더 이상 갱신되지 않습니다. 다시 보려면 초대 링크를 새로 받아 주세요.</p>
        <button class="btn-text-danger" id="syncDisableBtn">이 공유방 정리하기</button>`;
      return;
    }
    box.innerHTML = `
      <div class="sync-status on">${syncStatusText(st.status)}</div>
      ${last ? `<div class="sync-updated">🔄 <b data-reltime="${last}">${relTime(last)}</b> 업데이트됨</div>` : ''}
      ${renderNameCard()}
      ${renderParticipantNames()}
      <p class="sync-note">근무표는 소유자만 바꿀 수 있고 자동으로 반영됩니다. 날짜를 누르면 <b>메모는 함께 작성</b>할 수 있어요.</p>
      ${st.status==='error' ? `<div class="sync-msg err">${escapeHtml(st.error)}</div>` : ''}
      <button class="btn-text-danger" id="syncDisableBtn">이 공유방 나가기</button>`;
    return;
  }
  if(Sync.isOn()){  // owner
    const link = Sync.shareLink();
    const last = st.updatedAt;
    box.innerHTML = `
      <div class="sync-status ${st.status==='error'?'err':'on'}">${syncStatusText(st.status)}</div>
      ${st.status==='error' ? `<div class="sync-msg err">${escapeHtml(st.error)}</div>` : ''}
      ${renderNameCard()}
      ${renderParticipantNames()}
      <div class="sync-ready-copy">
        <strong>친구를 초대할 준비가 됐어요</strong>
        <span>초대 코드를 불러 주거나, 아래 버튼으로 링크를 보내세요.</span>
      </div>
      ${renderInviteCode()}
      <button class="btn-kakao sync-send" id="syncShareBtn">
        <span class="kakao-mark" aria-hidden="true"></span>
        카카오톡으로 친구 초대
      </button>
      <div class="sync-link-row">
        <input id="syncLink" class="sync-link" readonly value="${escapeHtml(link)}" />
        <button class="btn-soft" id="syncCopyBtn">링크 복사</button>
      </div>
      <div class="sync-qr" id="syncQr" hidden></div>
      <p class="sync-note">초대받은 친구는 근무표를 볼 수 있고, 날짜별 메모를 함께 작성할 수 있습니다.</p>
      ${last ? `<p class="sync-synced">마지막 동기화: <span data-reltime="${last}">${relTime(last)}</span></p>` : ''}
      <div class="sync-actions">
        <button class="btn-text-danger" id="syncDisableBtn">공유방 닫기</button>
      </div>`;
    renderShareQr(link);
    return;
  }
  if(Sync.managedReady()){
    box.innerHTML = `
      ${renderNameCard()}
      <div class="sync-intro">
        <div class="sync-intro-icon" aria-hidden="true">↗</div>
        <div>
          <strong>설정 없이 바로 공유하세요</strong>
          <p>공유방을 만든 뒤 카카오톡으로 링크만 보내면 됩니다. 친구가 바뀌어도 같은 링크를 다시 보낼 수 있어요.</p>
        </div>
      </div>
      <div class="sync-flow" aria-label="공유 순서">
        <span><b>1</b> 공유방 만들기</span>
        <span><b>2</b> 코드나 링크 전달</span>
        <span><b>3</b> 메모 함께 쓰기</span>
      </div>
      <button class="btn-primary" id="syncEnableBtn">공유방 만들기</button>
      <div class="sync-msg" id="syncMsg"></div>
      ${renderJoinByCode()}`;
    return;
  }

  // 배포 전 개발자 1회 설정. 출시된 앱 사용자에게는 이 화면이 보이지 않습니다.
  box.innerHTML = `
    <div class="sync-setup-alert">
      <strong>공유 서버 연결이 필요해요</strong>
      <p>출시 전에 운영자가 Firebase 설정을 한 번만 넣으면, 이후 사용자는 별도 설정 없이 공유할 수 있습니다.</p>
    </div>
    <details class="sync-guide">
      <summary>개발자용 1회 설정 열기</summary>
      <ol class="sync-steps">
        <li><b>Firebase 콘솔</b>에서 프로젝트를 만들고 Firestore Database를 서울 리전에 생성합니다.</li>
        <li><b>빌드 › Authentication › Sign-in method</b>에서 <b>익명</b> 로그인을 사용 설정합니다. 앱 사용자에게 로그인 화면은 표시되지 않습니다.</li>
        <li>Firestore의 <b>규칙</b> 탭에 아래 규칙을 게시합니다.
          <div class="sync-link-row">
            <textarea class="sync-rules" id="syncRules" rows="7" readonly>${escapeHtml(FIRESTORE_RULES)}</textarea>
          </div>
          <button class="btn-soft sm" id="syncCopyRules">규칙 복사</button>
        </li>
        <li>프로젝트 설정 › 내 앱 › 웹 앱에서 복사한 <b>firebaseConfig</b>를 <code>sync-config.js</code>에 넣고 다시 배포합니다.</li>
      </ol>
      <label class="sync-lbl" for="syncConfigInput">배포 전 임시 연결 테스트</label>
      <textarea id="syncConfigInput" class="sync-config" rows="7" placeholder='{\n  "apiKey": "AIza...",\n  "authDomain": "myapp.firebaseapp.com",\n  "projectId": "myapp",\n  "appId": "1:..."\n}'></textarea>
      <button class="btn-primary" id="syncEnableBtn">이 기기에서 테스트하기</button>
      <div class="sync-msg" id="syncMsg"></div>
    </details>`;
}

async function enableOwnerSync(){
  const input = $('syncConfigInput');
  const msg = $('syncMsg');
  if(msg){ msg.className = 'sync-msg'; msg.textContent = '연결 중…'; }
  try{
    await Sync.enableOwner(input ? input.value : '');
    renderSyncBox();
  }catch(e){
    if(msg){ msg.className = 'sync-msg err'; msg.textContent = e.message || String(e); }
  }
}

function copyToClipboard(text, okEl){
  const done = () => { if(okEl){ const o = okEl.textContent; okEl.textContent = '✓ 복사됨'; setTimeout(()=>{ okEl.textContent = o; }, 1400); } };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); done && done(); }catch(e){}
  document.body.removeChild(ta);
}

function renderSyncBanner(){
  const el = $('syncBanner');
  if(!el || !window.Sync) return;
  if(Sync.role() === 'viewer'){
    const st = Sync.getStatus();
    const people = androidBridge() && Sync.participants ? Sync.participants() : [];
    const owner = people.find(person=>person.role === 'owner');
    const ownerText = owner ? `${escapeHtml(owner.name)}님의 근무표 · ` : '';
    el.hidden = false;
    el.className = 'sync-banner' + (st.status==='error' ? ' err' : '');
    el.innerHTML = st.status==='error'
      ? `⚠️ 공유 연결 오류 — ${escapeHtml(st.error)}`
      : `💬 ${ownerText}친구와 공유 중 · <b>메모 작성 가능</b>${st.updatedAt ? ` · <b data-reltime="${st.updatedAt}">${relTime(st.updatedAt)}</b> 업데이트` : ' · 실시간 반영'}`;
    document.body.classList.add('readonly-mode');
  } else {
    el.hidden = true;
    document.body.classList.remove('readonly-mode');
  }
}

/*
 * 초대 링크를 받은 친구가 브라우저로 열었을 때만 앱 설치를 안내합니다.
 * 앱으로 열었거나(브리지 존재) 초대받은 사람이 아니면 보여 주지 않습니다.
 * 초대 링크 자체는 앱이 깔려 있으면 앱이 직접 받습니다(App Links).
 */
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=kr.co.shiftcalendar.widget';
const INSTALL_HIDE_KEY = 'shiftcal.installHidden';

function renderInstallBanner(){
  const el = $('installBanner');
  if(!el) return;
  const invited = !!(window.Sync && Sync.role() === 'viewer');
  const inApp = !!androidBridge();
  const onAndroid = /android/i.test(navigator.userAgent || '');
  let hidden = false;
  try{ hidden = localStorage.getItem(INSTALL_HIDE_KEY) === '1'; }catch(e){}
  if(!invited || inApp || !onAndroid || hidden){
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <img src="icons/icon-192-v2.png" alt="" />
    <div class="install-text">
      <strong>앱으로 보면 더 편해요</strong>
      <span>홈 화면 위젯으로 근무표를 바로 확인할 수 있어요.</span>
    </div>
    <a href="${PLAY_STORE_URL}" target="_blank" rel="noopener">설치</a>
    <button type="button" id="installClose" aria-label="설치 안내 닫기">✕</button>`;
  const close = $('installClose');
  if(close){
    close.onclick = ()=>{
      try{ localStorage.setItem(INSTALL_HIDE_KEY, '1'); }catch(e){}
      el.hidden = true;
    };
  }
}

// sync.js가 상태 변화 때 호출
window.onSyncStatus = function(){
  renderSyncBanner();
  renderInstallBanner();
  if($('settingsModal') && !$('settingsModal').hidden) renderSyncBox();
};

// '방금 전 / N분 전' 표시가 시간이 지나도 최신으로 보이도록 주기적 갱신
// (설정 폼 입력을 지우지 않도록 전체 재렌더 대신 시각 텍스트만 갱신)
function refreshSyncTimes(){
  if(!(window.Sync && Sync.isOn())) return;
  renderSyncBanner();
  document.querySelectorAll('[data-reltime]').forEach(el=>{
    el.textContent = relTime(el.dataset.reltime);
  });
}
setInterval(refreshSyncTimes, 30000);

function addShiftType(){
  if(!canEdit()) return;
  let n = 1, key = 'C1';
  while(state.shiftTypes[key]){ n++; key = 'C' + n; }
  state.shiftTypes[key] = { label:'새 근무', short:'?', start:'09:00', end:'18:00', color:'#64748b' };
  state.shiftOrder.push(key);
  saveState(); renderSettings(); renderAll();
}
function removeShiftType(key){
  if(!canEdit()) return;
  if(state.shiftOrder.length <= 1) return;
  const t = state.shiftTypes[key];
  if(!confirm(`'${t ? t.label : key}' 근무를 삭제할까요?\n(달력에서 이 근무로 지정된 날은 비워집니다)`)) return;
  delete state.shiftTypes[key];
  state.shiftOrder = state.shiftOrder.filter(k => k !== key);
  state.pattern.cycle = state.pattern.cycle.filter(k => k !== key);
  for(const group of GROUPS){
    const overrides = groupOverrideMap(group);
    for(const dt in overrides){ if(overrides[dt] === key) delete overrides[dt]; }
    const baseline = groupBaselineMap(group);
    for(const dt in baseline){ if(baseline[dt] === key) delete baseline[dt]; }
  }
  saveState(); renderSettings(); renderAll();
}

/* ---------- 설정: 반복 패턴 ---------- */
function renderPatternChips(){
  const cycle = state.pattern.cycle;
  if(!cycle.length){
    $('patternChips').innerHTML = '<span class="muted">패턴이 비어 있어요. 아래에서 근무를 추가하세요.</span>';
    return;
  }
  $('patternChips').innerHTML = cycle.map((key,i)=>{
    const t = state.shiftTypes[key] || { color:'#ccc', short:'?' };
    return `<span class="chip" style="--c:${t.color}">
      <button class="chip-mv" data-mv="-1" data-i="${i}" aria-label="왼쪽">‹</button>
      <span class="chip-badge" style="background:${t.color}">${t.short || t.label}</span>
      <button class="chip-mv" data-mv="1" data-i="${i}" aria-label="오른쪽">›</button>
      <button class="chip-x" data-x="${i}" aria-label="삭제">×</button>
    </span>`;
  }).join('');
}
function renderPatternAdd(){
  $('patternAdd').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    return `<button class="add-btn" data-add="${key}" style="background:${t.color}">+ ${t.short || t.label}</button>`;
  }).join('');
}

function openSettings(){ renderSettings(); $('settingsModal').hidden = false; }
function closeSettings(){ $('settingsModal').hidden = true; renderAll(); }

/* ---------- 데이터 백업 ---------- */
function exportData(){
  const json = JSON.stringify(state, null, 2);
  const fileName = `교대캘린더-백업-${todayStr()}.json`;

  /* Android 위젯 앱의 WebView는 blob: 다운로드를 처리하지 못하므로
     네이티브 브리지로 넘겨 다운로드 폴더에 저장합니다. */
  const bridge = window.AndroidWidget;
  if(bridge && typeof bridge.saveBackup === 'function'){
    bridge.saveBackup(fileName, json);
    return;
  }

  const blob = new Blob([json], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
function importData(file){
  if(!canEdit()) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      state = migrate(JSON.parse(reader.result));
      saveState(); renderSettings(); renderAll();
      alert('불러오기 완료!');
    }catch(e){ alert('파일을 읽을 수 없습니다: ' + e.message); }
  };
  reader.readAsText(file);
}

function selectGroup(group){
  const next = normalizeGroup(group);
  if(state.activeGroup === next) return;
  state.activeGroup = next;
  saveState();
  renderAll();
  if(selectedDate) openDaySheet(selectedDate);
}

function selectTab(nextTab){
  const next = TABS.includes(nextTab) ? nextTab : 'calendar';
  if(activeTab === next){
    /* 같은 탭을 다시 누르면 맨 위로 — 긴 목록에서 되돌아오는 흔한 동작이다. */
    window.scrollTo({ top:0, behavior:'smooth' });
    return;
  }
  activeTab = next;
  try{ localStorage.setItem(TAB_KEY, activeTab); }catch(e){}
  hideRangeBanner();
  renderCalendar();
  window.scrollTo({ top:0, behavior:'auto' });
}

/* ---------- 이벤트 연결 ---------- */
function wire(){
  $('teamBoard').addEventListener('click', (e)=>{
    if(e.target.closest('#teamToggle')){ toggleTeamBoard(); return; }
    const card = e.target.closest('[data-group]');
    if(card) selectGroup(card.dataset.group);
  });
  $('tabbar').addEventListener('click', (e)=>{
    const button = e.target.closest('[data-tab]');
    if(button) selectTab(button.dataset.tab);
  });
  $('groupBar').addEventListener('click', (e)=>{
    const chip = e.target.closest('[data-group]');
    if(chip) selectGroup(chip.dataset.group);
  });
  $('allGroupsGrid').addEventListener('click', (e)=>{
    const cell = e.target.closest('.all-group-cell');
    if(cell){
      const group = normalizeGroup(cell.dataset.group);
      if(group !== currentGroup()){
        state.activeGroup = group;
        saveState();
        renderAll();
      }
      openDaySheet(cell.dataset.date);
      return;
    }
    const label = e.target.closest('.all-group-label');
    if(label) selectGroup(label.dataset.group);
  });

  // 월 이동
  $('btnPrev').onclick = () => { if(--view.month < 0){ view.month=11; view.year--; } renderCalendar(); };
  $('btnNext').onclick = () => { if(++view.month > 11){ view.month=0; view.year++; } renderCalendar(); };
  const goToday = () => { const n=new Date(); view={year:n.getFullYear(), month:n.getMonth()}; renderCalendar(); };
  $('btnToday').onclick = goToday;
  /* 월 제목은 예전부터 버튼이었는데 아무 일도 하지 않았다 — 눌러서 오늘로 돌아온다. */
  $('monthTitle').onclick = goToday;

  /* 달력을 좌우로 밀면 달이 넘어간다(캘린더 앱의 기본 동작).

     폰에서 이게 안 먹던 이유가 세 가지였다.

     1) 밀 수 있는 곳이 달력 카드뿐이었다. 달을 넘기려는 사람은 달력 칸이 아니라
        월 제목 줄에서도 민다. 그래서 두 곳 다 받는다.
     2) 엄지로 미는 자국은 직선이 아니라 손목을 축으로 한 호다. "가로가 세로의
        1.6배를 넘어야 한다"는 조건이 그 호를 걸러 냈다(가로 150·세로 110인
        현실적인 궤적이 거부되는 것을 확인했다). 가로가 세로보다 길기만 하면 받는다.
     3) touch-action 이 기본값이면 브라우저가 이 제스처를 스크롤로 가져가며,
        가져가는 순간 pointermove 가 끊기고 pointercancel 이 온다. style.css 에서
        이 두 곳만 pan-y 로 두어 세로는 브라우저, 가로는 우리가 받는다. */
  const SWIPE_MIN = 48;
  const SWIPE_ZONE = '.month-nav, #singleCalendar';
  const swipeRoot = document.querySelector('.app') || document.body;
  let swipe = null;
  /* 밀어서 달을 넘기면 달력을 다시 그리므로, 손을 뗀 자리가 눌리지 않게 막는다. */
  let swipeGuardUntil = 0;

  const stepMonth = (forward)=>{
    if(forward){ if(++view.month > 11){ view.month = 0; view.year++; } }
    else { if(--view.month < 0){ view.month = 11; view.year--; } }
    renderCalendar();
  };
  const trySwipe = (e)=>{
    if(!swipe || swipe.done) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if(Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
    swipe.done = true;
    swipeGuardUntil = Date.now() + 400;
    cancelLp();
    hideRangeBanner();
    stepMonth(dx < 0);
  };

  swipeRoot.addEventListener('pointerdown', (e)=>{
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    const start = e.target && e.target.closest && e.target.closest(SWIPE_ZONE);
    swipe = start ? { x:e.clientX, y:e.clientY, done:false } : null;
  });
  swipeRoot.addEventListener('pointermove', trySwipe);
  /* 손을 뗄 때 한 번 더 본다 — 터치에서는 중간 pointermove 가 묶여 오거나
     마지막 한 번만 오는 경우가 있어, 그 한 번을 놓치면 제스처가 통째로 사라진다. */
  swipeRoot.addEventListener('pointerup', (e)=>{ trySwipe(e); swipe = null; });
  swipeRoot.addEventListener('pointercancel', ()=>{ swipe = null; });
  /* 민 직후의 click 은 민 자리 안에서만 막는다. 달력 칸이 열리는 것뿐 아니라, 월 이동
     버튼 위에서 밀기 시작했을 때 달이 두 번 넘어가는 것도 이것이 막는다.
     막는 범위를 민 자리로 한정하는 게 중요하다 — 화면 전체를 막으면 밀고 나서
     바로 하단 탭을 누른 사람의 손가락이 통째로 무시된다. */
  swipeRoot.addEventListener('click', (e)=>{
    if(Date.now() >= swipeGuardUntil) return;
    if(!(e.target && e.target.closest && e.target.closest(SWIPE_ZONE))) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // 날짜 셀: 짧게 탭 = 하루 편집 / 길게 누르기 = 기간 선택 시작
  const grid = $('grid');
  let lpTimer = null, lpFired = false, lpXY = null;
  const cancelLp = () => { if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; } };
  grid.addEventListener('pointerdown', (e)=>{
    const cell = e.target.closest('.cell');
    if(!cell || cell.classList.contains('empty')) return;
    lpFired = false; lpXY = { x:e.clientX, y:e.clientY };
    const date = cell.dataset.date;
    lpTimer = setTimeout(()=>{ lpTimer = null; lpFired = true; startRange(date); }, 480);
  });
  grid.addEventListener('pointermove', (e)=>{
    if(lpTimer && lpXY && (Math.abs(e.clientX-lpXY.x)>10 || Math.abs(e.clientY-lpXY.y)>10)) cancelLp();
  });
  grid.addEventListener('pointerup', cancelLp);
  grid.addEventListener('pointercancel', cancelLp);
  grid.addEventListener('pointerleave', cancelLp);
  grid.addEventListener('click', (e)=>{
    const cell = e.target.closest('.cell');
    if(!cell || cell.classList.contains('empty')) return;
    if(lpFired){ lpFired = false; return; }   // 길게 누른 직후 발생하는 click 무시
    if(Date.now() < swipeGuardUntil) return;  // 달을 넘긴 직후의 click 무시
    if(rangeAnchor){                          // 두 번째 탭 = 기간 끝
      const start = rangeAnchor, end = cell.dataset.date;
      hideRangeBanner();
      openRangeSheet(start, end);
      renderCalendar();
      return;
    }
    openDaySheet(cell.dataset.date);
  });
  $('rangeCancel').onclick = () => { hideRangeBanner(); renderCalendar(); };

  // 시트
  $('dayBackdrop').onclick = closeDaySheet;
  $('btnCloseSheet').onclick = closeDaySheet;
  $('btnRevert').onclick = () => {
    if(!canEdit()) return;   // 보기 전용은 근무표를 지울 수 없다
    const group = currentGroup();
    if(sheetRange){
      clearRange(group, rangeDays(sheetRange.start, sheetRange.end));
      saveState(); renderCalendar(); renderTeamBoard();
      openRangeSheet(sheetRange.start, sheetRange.end);
      return;
    }
    if(selectedDate){
      delete groupOverrideMap(group)[selectedDate];
      saveState(); openDaySheet(selectedDate); renderCalendar(); renderTeamBoard();
    }
  };
  $('sheetOptions').addEventListener('click', (e)=>{
    const opt = e.target.closest('.opt');
    if(opt) setShift(opt.dataset.code);
  });
  $('sheetDesig').addEventListener('click', (e)=>{
    const b = e.target.closest('.desig-opt');
    if(b && !b.disabled) setDesig(b.dataset.desig);
  });
  $('sheetMemo').addEventListener('input', (e)=>{
    updateMemoCount(e.target.value);
    saveMemoValue(e.target.value);
  });
  $('memoPresets').addEventListener('click', (e)=>{
    if(!canEditMemo()) return;
    const btn = e.target.closest('[data-memo]');
    if(!btn) return;
    const input = $('sheetMemo');
    const memo = btn.dataset.memo;
    const current = input.value.trim();
    const max = Number(input.getAttribute('maxlength')) || 80;
    const next = current
      ? (current.includes(memo) ? current : `${current} · ${memo}`)
      : memo;
    input.value = next.slice(0, max);
    updateMemoCount(input.value);
    saveMemoValue(input.value);
    input.focus();
  });
  $('memoPanel').addEventListener('click', (e)=>{
    const item = e.target.closest('[data-date]');
    if(item) openDaySheet(item.dataset.date);
  });

  // 설정 열기/닫기
  $('btnSettings').onclick = openSettings;
  $('btnCloseSettings').onclick = closeSettings;

  // 공유(실시간 동기화) 버튼
  $('syncBox').addEventListener('click', (e)=>{
    const t = e.target.closest('button'); if(!t) return;
    if(t.dataset && t.dataset.kick){ kickParticipant(t.dataset.kick, t.dataset.name || '이 참여자'); }
    else if(t.id === 'syncJoinBtn'){ joinByInviteCode(t); }
    else if(t.id === 'syncCodeCopy'){ copyToClipboard(Sync.code(), t); }
    else if(t.id === 'syncEnableBtn'){ enableOwnerSync(); }
    else if(t.id === 'syncShareBtn'){ shareSyncLink(t); }
    else if(t.id === 'syncCopyBtn'){ copyToClipboard($('syncLink').value, t); }
    else if(t.id === 'syncCopyRules'){ copyToClipboard(FIRESTORE_RULES, t); }
    else if(t.id === 'syncNameSave'){
      const input = $('syncNameInput');
      saveDisplayName(input ? input.value : '');
    }
    else if(t.id === 'syncNameClear'){
      if(confirm('이름을 지울까요? 공유방 참여자 목록에서도 내 이름이 사라집니다.')){
        t.disabled = true;
        saveDisplayName('');
      }
    }
    else if(t.id === 'syncDisableBtn'){
      const leaving = Sync.role() === 'viewer';
      const message = leaving
        ? '이 공유방에서 나갈까요? 내 기기의 연결만 해제됩니다.'
        : '공유방을 닫을까요? 클라우드에 저장된 공유 데이터와 초대 링크가 삭제됩니다.';
      if(confirm(message)){
        t.disabled = true;
        Sync.disable()
          .then(()=>{ renderSyncBox(); renderSyncBanner(); renderAll(); })
          .catch(()=>{ t.disabled = false; renderSyncBox(); });
      }
    }
  });

  // 이름 입력칸: 타이핑 중인 값을 기억하고, 엔터로도 저장합니다.
  $('syncBox').addEventListener('input', (e)=>{
    if(e.target && e.target.id === 'syncNameInput') nameDraft = e.target.value;
  });
  $('syncBox').addEventListener('keydown', (e)=>{
    if(e.target && e.target.id === 'syncNameInput' && e.key === 'Enter'){
      e.preventDefault();
      saveDisplayName(e.target.value);
    }
  });

  // 수동 변경 → 기본 확정
  $('baselineBox').addEventListener('click', (e)=>{
    const t = e.target.closest('button'); if(!t) return;
    if(t.id === 'baselineConfirmBtn') confirmOverridesToBaseline();
  });

  // 근무 종류: 추가/삭제(클릭) + 수정(입력)
  $('setThemePick').addEventListener('click', (e)=>{
    const button = e.target.closest('[data-theme-mode]');
    if(button) selectTheme(button.dataset.themeMode);
  });
  /* '자동'으로 두었으면 기기 설정이 바뀌는 즉시 따라간다(밤에 자동 전환되는 폰). */
  if(window.matchMedia){
    const watcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = ()=>{ if(themeMode() === 'auto') applyTheme(); };
    if(watcher.addEventListener) watcher.addEventListener('change', onChange);
    else if(watcher.addListener) watcher.addListener(onChange);
  }
  $('setGroupPick').addEventListener('click', (e)=>{
    const button = e.target.closest('[data-group]');
    if(!button) return;
    selectGroup(button.dataset.group);
    renderGroupPick();
  });
  $('setShiftTypes').addEventListener('click', (e)=>{
    if(e.target.id === 'btnAddType') addShiftType();
    else if(e.target.dataset.del !== undefined) removeShiftType(e.target.dataset.del);
  });
  function onShiftTypeEdit(e){
    if(!canEdit()) return;
    const card = e.target.closest('.st-card'); if(!card) return;
    const key = card.dataset.code, field = e.target.dataset.field;
    if(!field) return;
    if(field === 'kindoff') state.shiftTypes[key].kind = e.target.checked ? 'off' : 'work';
    else state.shiftTypes[key][field] = e.target.value;
    saveState();
    renderAll(); renderPatternChips(); renderPatternAdd(); // 설정 화면은 다시 안 그림(입력 포커스 유지)
  }
  $('setShiftTypes').addEventListener('input', onShiftTypeEdit);
  $('setShiftTypes').addEventListener('change', onShiftTypeEdit);

  // 패턴 칩(이동/삭제)
  $('patternChips').addEventListener('click', (e)=>{
    if(!canEdit()) return;
    const cycle = state.pattern.cycle;
    if(e.target.dataset.x !== undefined){
      cycle.splice(Number(e.target.dataset.x), 1);
    } else if(e.target.dataset.mv !== undefined){
      const i = Number(e.target.dataset.i), j = i + Number(e.target.dataset.mv);
      if(j >= 0 && j < cycle.length){ [cycle[i], cycle[j]] = [cycle[j], cycle[i]]; }
    } else return;
    saveState(); renderPatternChips(); renderAll();
  });
  $('patternAdd').addEventListener('click', (e)=>{
    if(!canEdit()) return;
    const key = e.target.dataset.add;
    if(!key) return;
    state.pattern.cycle.push(key);
    saveState(); renderPatternChips(); renderAll();
  });
  $('btnClearPattern').onclick = () => {
    if(!canEdit()) return;
    if(confirm('반복 패턴을 모두 비울까요?')){ state.pattern.cycle = []; saveState(); renderPatternChips(); renderAll(); }
  };
  $('btnDefaultPattern').onclick = () => {
    if(!canEdit()) return;
    state.pattern.cycle = clone(DEFAULT_CYCLE);
    saveState(); renderPatternChips(); renderAll();
  };

  // 패턴 시작일
  $('startDate').addEventListener('change', (e)=>{
    if(!canEdit()) return;
    state.pattern.startDate = e.target.value || todayStr();
    saveState(); renderAll();
  });

  // 데이터
  $('btnExport').onclick = exportData;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', (e)=>{ if(e.target.files[0]) importData(e.target.files[0]); e.target.value=''; });
  $('btnReset').onclick = () => {
    if(!canEdit()) return;
    if(confirm('모든 데이터를 지우고 처음 상태로 되돌릴까요?')){
      localStorage.removeItem(STORAGE_KEY);
      state = clone(DEFAULT_STATE);
      saveState(); renderSettings(); renderAll();
    }
  };

  // ESC 로 닫기
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    if(!$('daySheet').hidden) closeDaySheet();
    else if(!$('settingsModal').hidden) closeSettings();
  });
}

/* ---------- 시작 ---------- */
renderWeekdays();
applyTheme();            // 머리 스크립트가 정한 테마에 theme-color 까지 맞춘다
renderAll();
wire();
/* 화면을 돌리거나 창 크기가 바뀌면 칸 높이가 달라지므로 메모 줄 수를 다시 센다. */
if(typeof ResizeObserver === 'function'){
  new ResizeObserver(()=> syncMemoLines()).observe($('grid'));
}else{
  window.addEventListener('resize', syncMemoLines);
}
if(window.Sync && Sync.init){ renderSyncBanner(); renderInstallBanner(); Sync.init(); }  // 공유 링크 감지 + 실시간 연결
