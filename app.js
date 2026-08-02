'use strict';

/* ============================================================
   교대캘린더 — 변형 4조 3교대 (D / S / G / O / D2 / G2 / 휴)
   - 근무 종류 자유 커스텀(추가·삭제·수정)
   - 반복 패턴(사이클) 자동 계산 + 날짜별 수동 변경(override)
   - 데이터는 localStorage 저장
   ============================================================ */

const STORAGE_KEY = 'shiftcal.v2';
const CALENDAR_VIEW_KEY = 'shiftcal.calendarView';
const BASE_DATE = '2026-06-25';
const BASE_PATTERN_START = '2026-06-09'; // 2026-06-25 = A조 GY 4일차
const GROUPS = ['A','B','C','D'];
const GROUP_OFFSETS = { A:0, B:5, C:10, D:15 };

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
  version: 6,
  activeGroup: 'A',
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
  groupOverrides: { A:{}, B:{}, C:{}, D:{} }, // { A: { 'YYYY-MM-DD': shiftKey }, ... } — 수동 변경(빨간 네모 표시)
  groupBaseline:  { A:{}, B:{}, C:{}, D:{} }, // 확정된 '기본 근무'(표시 없음). 패턴/명절보다 우선, 수동변경보다 아래
  overrides: {},  // legacy: A조 수동 변경
  groupMemos: { A:{}, B:{}, C:{}, D:{} },     // 조별 메모 { A: { 'YYYY-MM-DD': '메모' }, ... }
  groupDesig: { A:{}, B:{}, C:{}, D:{} },     // 조별 수동 지정태그 { A: { 'YYYY-MM-DD': 'JG'|'JH' }, ... }
  groupDesigCount: { A:{}, B:{}, C:{}, D:{} },// 조별 월별 자동배치 개수 { A: { 'YYYY-MM': { jg, jh } }, ... }
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
    out.activeGroup = GROUPS.includes(s.activeGroup) ? s.activeGroup : base.activeGroup;
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
let calendarView = (() => {
  try{ return localStorage.getItem(CALENDAR_VIEW_KEY) === 'all' ? 'all' : 'single'; }
  catch(e){ return 'single'; }
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
function normalizeGroup(group){ return GROUPS.includes(group) ? group : 'A'; }
function currentGroup(){ return normalizeGroup(state.activeGroup); }
function groupOffset(group){ return GROUP_OFFSETS[normalizeGroup(group)] || 0; }
function groupOverrideMap(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupOverrides) state.groupOverrides = { A:{}, B:{}, C:{}, D:{} };
  if(!state.groupOverrides[g]) state.groupOverrides[g] = {};
  return state.groupOverrides[g];
}
function memosFor(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupMemos) state.groupMemos = { A:{}, B:{}, C:{}, D:{} };
  if(!state.groupMemos[g]) state.groupMemos[g] = {};
  return state.groupMemos[g];
}
function isOverride(dateStr, group = currentGroup()){
  return Object.prototype.hasOwnProperty.call(groupOverrideMap(group), dateStr);
}
function groupBaselineMap(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupBaseline) state.groupBaseline = { A:{}, B:{}, C:{}, D:{} };
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
function groupShiftFor(dateStr, group){
  const bl = groupBaselineMap(group)[dateStr];         // 확정된 기본 근무가 최우선(패턴·명절보다)
  if(bl && state.shiftTypes[bl]) return bl;
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
/* 패밀리데이 가능일 = 급여일(21일)이 속한 주의 2주 전 주 금요일 (회사 규정). 매월 5~11일 사이 금요일. */
function familyDayDom(year, month0){ const dow21 = new Date(year, month0, 21).getDay(); return 11 - ((dow21 + 6) % 7); }
function familyDayStr(year, month0){ return `${year}-${pad(month0+1)}-${pad(familyDayDom(year, month0))}`; }
function isFamilyDayCandidate(dateStr){ const [y,m] = dateStr.split('-').map(Number); return dateStr === familyDayStr(y, m-1); }

/* ---------- 태그(특근/지근/지휴): 근무 위에 덧붙는 자동 태그 ----------
   지근 = 휴일(주말·공휴일) 근무 / 지휴 = 평일 휴무 (지근·지휴는 항상 1:1 — 적은 쪽 개수에 맞춰 가장 앞부터)
   특근 = 지근으로 못 쓴 잔여 휴일 근무
   연차·특휴·패밀리데이(leave:true)는 근무도 휴무도 아닌 '휴가' → 지근·지휴·특근 정산에서 완전히 제외.
     · 특휴를 휴일근무일에 쓰면 → 그 날이 휴일근무에서 빠져 지근이 다음 휴일근무일로 이동
     · 패밀리데이를 평일휴무일에 쓰면 → 지휴 짝이 하나 줄어 지근 하나가 특근으로 전환
   수동(groupDesig: 'TG'|'JG'|'JH'|'NONE')이 자동보다 우선 (단, 현재 근무에 적합할 때만) */
function desigMapFor(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupDesig) state.groupDesig = { A:{}, B:{}, C:{}, D:{} };
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
      ${group===selected ? `<span class="team-time">${escapeHtml(timeText(t))}</span>` : ''}
    </button>`;
  }).join('');
  el.innerHTML = `
    <div class="team-head">
      <span>A/B/C/D 오늘 배치</span>
      <b>오늘 · ${todayLabel}</b>
    </div>
    <div class="team-grid">${items}</div>`;
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
    const dayClass = isHoliday(dateStr) || dow === 0 ? ' sun' : (dow === 6 ? ' sat' : '');
    return `<div class="all-date-head${dayClass}${dateStr===today?' today':''}" data-date="${dateStr}">
      <span>${day}</span><small>${WEEK[dow]}</small>
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
  grid.innerHTML = `<div class="all-groups-corner">조</div>${dateHeaders}${rows}`;

  requestAnimationFrame(()=>{
    const scroll = $('allGroupsScroll');
    const todayHead = grid.querySelector('.all-date-head.today');
    scroll.scrollLeft = todayHead ? Math.max(0, todayHead.offsetLeft - 125) : 0;
  });
}

function renderCalendar(){
  const showAllGroups = calendarView === 'all';
  document.querySelectorAll('[data-calendar-view]').forEach(button=>{
    const active = button.dataset.calendarView === calendarView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('singleCalendar').hidden = showAllGroups;
  $('allGroupsCalendar').hidden = !showAllGroups;
  $('memoPanel').hidden = showAllGroups;
  $('summary').hidden = showAllGroups;

  if(showAllGroups){
    $('monthTitle').textContent = `${view.year}년 ${view.month+1}월 · 4개 조`;
    renderAllGroupsCalendar();
    return;
  }

  const group = currentGroup();
  $('monthTitle').textContent = `${view.year}년 ${view.month+1}월 · ${group}조`;
  const startDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const todayS = todayStr();
  const rangeSet = sheetRange ? new Set(rangeDays(sheetRange.start, sheetRange.end)) : null;
  const memos = memosFor(group);
  const tagMap = tagsForMonth(group, view.year, view.month);
  const famDayStr = familyDayStr(view.year, view.month);
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
    const dnumCls = hol ? 'sun' : (dow===0 ? 'sun' : (dow===6 ? 'sat' : ''));
    const memo = memos[dateStr];
    const hasMemo = !!memo;
    const special = isSpecialSchedule(dateStr, group) && !isOverride(dateStr, group) && !isBaseline(dateStr, group);
    const longRun = workRunTotalFor(dateStr, group) >= 6;
    const selCls = `${rangeAnchor===dateStr ? ' range-anchor' : ''}${rangeSet && rangeSet.has(dateStr) ? ' range-sel' : ''}`;
    const isFam = dateStr === famDayStr;
    html += `<button class="cell ${dateStr===todayS?'today':''}${hasMemo?' has-memo':''}${hasTag?' has-tag':''}${special?' is-special':''}${longRun?' long-run':''}${isFam?' is-familyday':''}${selCls}" data-date="${dateStr}" style="--tint:${tint}">
      <span class="cell-top"><span class="dnum ${dnumCls}">${d}</span>${tagHtml}</span>
      ${badge}
      ${isOverride(dateStr, group) ? '<span class="dot-ov"></span>' : ''}
      ${isFam ? '<span class="fam-mark" title="패밀리데이 가능일 (급여일 2주 전 금)">💛</span>' : ''}
      ${memo ? `<span class="memo-pin" aria-hidden="true"></span><span class="cell-memo" title="${escapeHtml(memo)}">${escapeHtml(memoPreview(memo))}</span>` : '<span class="cell-memo-slot" aria-hidden="true"></span>'}
    </button>`;
  }
  $('grid').innerHTML = html;
  $('summary').hidden = false;
  renderMemoPanel();
  renderSummary();
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

  el.hidden = false;

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
  $('summary').innerHTML =
    `<span class="sm sm-group">${group}조</span>` +
    `<span class="sm sm-work">근무 <b>${work}</b></span>` +
    `<span class="sm sm-off">휴무 <b>${off}</b></span>` +
    `<span class="sm sm-teuk">특근 <b>${teuk}</b></span>` +
    `<span class="sm sm-jg">지근 <b>${jg}</b></span>` +
    `<span class="sm sm-jh">지휴 <b>${jh}</b></span>`;
}

/* ---------- Android 홈 화면 위젯 연결 ----------
   네이티브 앱의 WebView가 제공하는 AndroidWidget 브리지에 달력 스냅샷을 전달합니다.
   브라우저/PWA에서는 브리지가 없으므로 아무 작업도 하지 않습니다. */
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

function openRangeSheet(a, b){
  selectedDate = null;
  sheetRange = { start: a, end: b };
  const group = currentGroup();
  const days = rangeDays(a, b);
  const s = parseYmd(days[0]), e = parseYmd(days[days.length-1]);
  $('sheetDate').textContent = `${s.getMonth()+1}월 ${s.getDate()}일 ~ ${e.getMonth()+1}월 ${e.getDate()}일 · ${days.length}일 · ${group}조`;
  $('sheetHoliday').hidden = true;
  document.querySelector('.sheet-hint').innerHTML = `선택한 <b>${days.length}일</b>에 한꺼번에 적용돼요. (지근/지휴는 가능한 날에만)`;
  $('sheetOptions').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    const anyValid = days.some(ds => canPlace(key, ds, group));
    return `<button class="opt ${anyValid?'':'opt-disabled'}" data-code="${key}" ${anyValid?'':'disabled'} style="--c:${t.color}">
      <span class="opt-badge" style="background:${t.color}">${t.short || t.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${t.label}</span>
      <span class="opt-time">${timeText(t)}</span></span>
    </button>`;
  }).join('');
  $('sheetDesig').hidden = true;
  $('sheetMemo').value = '';
  updateMemoCount('');
  $('btnRevert').textContent = '↺ 이 기간 수동변경·메모 지우기';
  $('btnRevert').hidden = false;
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
  if(isFamilyDayCandidate(dateStr)) infoParts.push('<span class="sh-fam">💛 패밀리데이 가능일</span>');
  if(infoParts.length){ sh.hidden = false; sh.innerHTML = infoParts.join(' '); }
  else { sh.hidden = true; sh.innerHTML = ''; }
  const ro = !canEdit();
  const memoWritable = canEditMemo();
  const current = shiftFor(dateStr, group);
  $('daySheet').classList.toggle('sheet-ro', ro);
  document.querySelector('.sheet-hint').innerHTML = ro
    ? '👀 공유 화면입니다. 근무표는 보기 전용이고 <b>메모는 함께 작성</b>할 수 있어요.'
    : '이 날의 근무를 선택하세요. (패턴과 다르게 바꾸면 <b>수동 변경</b>으로 표시)';
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
  if(ro){ $('sheetDesig').hidden = true; }
  else { renderSheetDesig(dateStr, group); }
  const memoText = memosFor(group)[dateStr] || '';
  $('sheetMemo').value = memoText;
  $('sheetMemo').readOnly = !memoWritable;
  $('sheetMemo').placeholder = ro ? '함께 볼 메모를 남겨보세요' : '예: 교육, 비번, 연차…';
  $('memoPresets').hidden = !memoWritable;
  $('memoEditor').style.display = (!memoWritable && !memoText) ? 'none' : '';
  $('memoEditor').classList.toggle('memo-shared', ro && memoWritable);
  updateMemoCount(memoText);
  $('btnRevert').textContent = isBaseline(dateStr, group) ? '↺ 확정된 기본값으로 되돌리기' : '↺ 패턴 값으로 되돌리기';
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
function renderSettings(){
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
  return ({ connecting:'⏳ 연결 중…', live:'🟢 실시간 공유 중', readonly:'💬 공유 연결됨 · 메모 작성 가능', error:'⚠️ 오류', off:'꺼짐' })[s] || s;
}

let kakaoIdentity = { status:'checking', nickname:'', message:'' };

function androidBridge(){
  return window.AndroidWidget || null;
}

function renderKakaoIdentity(){
  const bridge = androidBridge();
  if(!bridge || typeof bridge.loginWithKakao !== 'function') return '';
  if(kakaoIdentity.status === 'connected' && kakaoIdentity.nickname){
    return `<div class="kakao-identity connected">
      <span class="kakao-avatar" aria-hidden="true">${escapeHtml(kakaoIdentity.nickname.slice(0,1))}</span>
      <span><strong>${escapeHtml(kakaoIdentity.nickname)}</strong><small>카카오 닉네임으로 참여 중</small></span>
      <button class="btn-identity-link" id="syncKakaoDisconnect">연결 해제</button>
    </div>`;
  }
  const waiting = kakaoIdentity.status === 'checking';
  const message = kakaoIdentity.status === 'error' ? kakaoIdentity.message : '';
  return `<div class="kakao-login-card">
    <div><strong>내 이름 표시하기</strong><p>카카오 로그인하면 초대 문구와 공유방 참여자에 닉네임이 표시돼요.</p></div>
    <button class="btn-kakao-login" id="syncKakaoLogin" ${waiting?'disabled':''}>
      <span class="kakao-mark" aria-hidden="true"></span>${waiting?'확인 중…':'카카오 로그인'}
    </button>
    ${message ? `<p class="kakao-login-error">${escapeHtml(message)}</p>` : ''}
    <small>이메일·전화번호·프로필 사진은 앱 기능에 사용하거나 저장하지 않습니다.</small>
  </div>`;
}

function renderParticipantNames(){
  if(!androidBridge() || !window.Sync || !Sync.isOn()) return '';
  const people = Sync.participants ? Sync.participants() : [];
  const status = Sync.getStatus ? Sync.getStatus() : {};
  const list = people.length
    ? `<div class="participant-list">${people.map(person=>`
        <span class="participant-chip ${person.role==='owner'?'owner':''}">
          <i>${escapeHtml(person.name.slice(0,1))}</i>${escapeHtml(person.name)}
          ${person.role==='owner'?'<b>공유자</b>':''}
        </span>`).join('')}</div>`
    : '<p class="participant-empty">카카오 로그인한 참여자의 이름이 여기에 표시됩니다.</p>';
  return `<div class="participants-card">
    <div class="participants-title"><strong>공유방 참여자</strong><span>${people.length}명</span></div>
    ${list}
    ${status.participantError ? `<p class="kakao-login-error">이름 동기화 오류 · ${escapeHtml(status.participantError)}</p>` : ''}
  </div>`;
}

window.onAndroidKakaoUser = function(payload){
  const next = payload && typeof payload === 'object' ? payload : {};
  const status = String(next.status || 'error');
  const nickname = String(next.nickname || '').trim().slice(0,20);
  kakaoIdentity = {
    status,
    nickname: status === 'connected' ? nickname : '',
    message: String(next.message || ''),
  };
  if(window.Sync){
    if(status === 'connected' && nickname && Sync.setProfile) Sync.setProfile(nickname);
    else if(status === 'signed_out' && Sync.clearProfile) Sync.clearProfile();
  }
  if($('settingsModal') && !$('settingsModal').hidden) renderSyncBox();
};

function requestKakaoIdentity(){
  const bridge = androidBridge();
  if(bridge && typeof bridge.requestKakaoUser === 'function') bridge.requestKakaoUser();
  else kakaoIdentity = { status:'signed_out', nickname:'', message:'' };
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
  const sender = kakaoIdentity.status === 'connected' ? kakaoIdentity.nickname : '';
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
    box.innerHTML = `
      <div class="sync-status on">${syncStatusText(st.status)}</div>
      ${last ? `<div class="sync-updated">🔄 <b data-reltime="${last}">${relTime(last)}</b> 업데이트됨</div>` : ''}
      ${renderKakaoIdentity()}
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
      ${renderKakaoIdentity()}
      ${renderParticipantNames()}
      <div class="sync-ready-copy">
        <strong>친구를 초대할 준비가 됐어요</strong>
        <span>아래 버튼을 누르면 카카오톡으로 초대 링크를 보낼 수 있어요.</span>
      </div>
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
      ${renderKakaoIdentity()}
      <div class="sync-intro">
        <div class="sync-intro-icon" aria-hidden="true">↗</div>
        <div>
          <strong>설정 없이 바로 공유하세요</strong>
          <p>공유방을 만든 뒤 카카오톡으로 링크만 보내면 됩니다. 친구가 바뀌어도 같은 링크를 다시 보낼 수 있어요.</p>
        </div>
      </div>
      <div class="sync-flow" aria-label="공유 순서">
        <span><b>1</b> 공유방 만들기</span>
        <span><b>2</b> 카카오톡으로 초대</span>
        <span><b>3</b> 메모 함께 쓰기</span>
      </div>
      <button class="btn-primary" id="syncEnableBtn">공유방 만들기</button>
      <div class="sync-msg" id="syncMsg"></div>`;
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

// sync.js가 상태 변화 때 호출
window.onSyncStatus = function(){
  renderSyncBanner();
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

function selectCalendarView(nextView){
  const next = nextView === 'all' ? 'all' : 'single';
  if(calendarView === next) return;
  calendarView = next;
  try{ localStorage.setItem(CALENDAR_VIEW_KEY, calendarView); }catch(e){}
  hideRangeBanner();
  renderCalendar();
}

/* ---------- 이벤트 연결 ---------- */
function wire(){
  $('teamBoard').addEventListener('click', (e)=>{
    const card = e.target.closest('[data-group]');
    if(card) selectGroup(card.dataset.group);
  });
  $('calendarViewTabs').addEventListener('click', (e)=>{
    const button = e.target.closest('[data-calendar-view]');
    if(button) selectCalendarView(button.dataset.calendarView);
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
  $('btnToday').onclick = () => { const n=new Date(); view={year:n.getFullYear(), month:n.getMonth()}; renderCalendar(); };

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
    const group = currentGroup();
    if(sheetRange){
      const ov = groupOverrideMap(group), mm = memosFor(group);
      rangeDays(sheetRange.start, sheetRange.end).forEach(ds=>{ delete ov[ds]; delete mm[ds]; });
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
    if(t.id === 'syncEnableBtn'){ enableOwnerSync(); }
    else if(t.id === 'syncShareBtn'){ shareSyncLink(t); }
    else if(t.id === 'syncCopyBtn'){ copyToClipboard($('syncLink').value, t); }
    else if(t.id === 'syncCopyRules'){ copyToClipboard(FIRESTORE_RULES, t); }
    else if(t.id === 'syncKakaoLogin'){
      const bridge = androidBridge();
      if(bridge && typeof bridge.loginWithKakao === 'function'){
        kakaoIdentity = { status:'checking', nickname:'', message:'' };
        renderSyncBox();
        bridge.loginWithKakao();
      }
    }
    else if(t.id === 'syncKakaoDisconnect'){
      const bridge = androidBridge();
      if(bridge && typeof bridge.disconnectKakao === 'function'
        && confirm('카카오 연결을 해제할까요? 공유방에 표시된 내 이름도 삭제됩니다.')){
        t.disabled = true;
        bridge.disconnectKakao();
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

  // 수동 변경 → 기본 확정
  $('baselineBox').addEventListener('click', (e)=>{
    const t = e.target.closest('button'); if(!t) return;
    if(t.id === 'baselineConfirmBtn') confirmOverridesToBaseline();
  });

  // 근무 종류: 추가/삭제(클릭) + 수정(입력)
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
renderAll();
wire();
if(window.Sync && Sync.init){ renderSyncBanner(); Sync.init(); }  // 공유 링크 감지 + 실시간 연결
requestKakaoIdentity();
