'use strict';

/* ============================================================
   교대 캘린더 — 변형 4조 3교대 (D / S / G / O / D2 / G2 / 휴)
   - 근무 종류 자유 커스텀(추가·삭제·수정)
   - 반복 패턴(사이클) 자동 계산 + 날짜별 수동 변경(override)
   - 데이터는 localStorage 저장
   ============================================================ */

const STORAGE_KEY = 'shiftcal.v2';
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
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const WEEK = ['일','월','화','수','목','금','토'];

/* ---------- 공휴일(빨간날) ----------
   출처: publicholidays.co.kr / gyesan.co.kr (2026년 법정공휴일 19일, 제헌절 제외) */
const HOLIDAYS = {
  '2026-01-01':'신정',
  '2026-02-16':'설날','2026-02-17':'설날','2026-02-18':'설날',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날','2026-05-25':'부처님오신날 대체',
  '2026-06-03':'지방선거','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-08-17':'광복절 대체',
  '2026-09-24':'추석','2026-09-25':'추석','2026-09-26':'추석',
  '2026-10-03':'개천절','2026-10-05':'개천절 대체',
  '2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
};
function holidayName(dateStr){ return HOLIDAYS[dateStr] || null; }
function isHoliday(dateStr){ return !!HOLIDAYS[dateStr]; }

/* ---------- 기본 상태 ----------
   ※ 모든 시간/이름/색/패턴은 설정에서 자유롭게 바꿀 수 있는 "기본값"입니다. */
const DEFAULT_STATE = {
  version: 6,
  activeGroup: 'A',
  shiftOrder: ['D','S','G','O','D2','G2','OFF'],
  shiftTypes: {
    D:   { label:'DAY',  short:'D',  start:'06:00', end:'14:00', color:'#f59e0b', kind:'work' },
    S:   { label:'SW',   short:'S',  start:'14:00', end:'22:00', color:'#10b981', kind:'work' },
    G:   { label:'GY',   short:'G',  start:'22:00', end:'06:00', color:'#6366f1', kind:'work' },
    O:   { label:'오피스', short:'O',  start:'09:00', end:'18:00', color:'#0ea5e9', kind:'work' },
    D2:  { label:'DAY2', short:'D2', start:'06:00', end:'18:00', color:'#fb923c', kind:'work' },
    G2:  { label:'GY2',  short:'G2', start:'18:00', end:'06:00', color:'#a78bfa', kind:'work' },
    OFF: { label:'휴무', short:'휴', start:'',      end:'',      color:'#94a3b8', kind:'off'  },
  },
  pattern: {
    // 20일 주기: D×5 · 휴×2 · S×5 · 휴×1 · G×5 · 휴×2
    cycle: ['D','D','D','D','D','OFF','OFF','S','S','S','S','S','OFF','G','G','G','G','G','OFF','OFF'],
    startDate: BASE_PATTERN_START,   // 이 날짜 = A조 cycle[0] (첫 D)
  },
  groupOverrides: { A:{}, B:{}, C:{}, D:{} }, // { A: { 'YYYY-MM-DD': shiftKey }, ... }
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
function saveState(){
  try{
    state.overrides = groupOverrideMap('A');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  catch(e){ console.warn('저장 실패', e); }
}

let state = loadState();
let view = { year: new Date().getFullYear(), month: new Date().getMonth() }; // month: 0-11
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
function shiftFor(dateStr, group = currentGroup()){
  const overrides = groupOverrideMap(group);
  const key = isOverride(dateStr, group) ? overrides[dateStr] : groupShiftFor(dateStr, group);
  return state.shiftTypes[key] ? key : null;  // 삭제된 근무 key 면 null
}
function mod(n, m){ return ((n % m) + m) % m; }
function cycleIndexFor(dateStr, offset = 0){
  const cycle = state.pattern.cycle;
  if(!cycle || !cycle.length) return null;
  return mod(dayDiff(state.pattern.startDate, dateStr) + offset, cycle.length);
}
function groupShiftFor(dateStr, group){
  const idx = cycleIndexFor(dateStr, groupOffset(group));
  return idx === null ? null : state.pattern.cycle[idx];
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
function shiftDayText(dateStr, group){
  if(isOverride(dateStr, group)) return '수동 변경';
  const runDay = groupRunDayFor(dateStr, group);
  return runDay ? `${runDay}일차` : '';
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

/* ---------- 태그(특근/지근/지휴): 근무 위에 덧붙는 자동 태그 ----------
   특근 = 평일 공휴일 근무 / 지근 = 주말 근무 / 지휴 = 지근 수만큼 평일 휴무(가장 앞부터)
   수동(groupDesig: 'TG'|'JG'|'JH'|'NONE')이 자동보다 우선 */
function desigMapFor(group = currentGroup()){
  const g = normalizeGroup(group);
  if(!state.groupDesig) state.groupDesig = { A:{}, B:{}, C:{}, D:{} };
  if(!state.groupDesig[g]) state.groupDesig[g] = {};
  return state.groupDesig[g];
}
function isWorkerOff(dateStr, group){ const t = state.shiftTypes[shiftFor(dateStr, group)]; return !t || t.kind === 'off'; }
function tgEligible(d, g){ return !isWorkerOff(d, g) && (isWeekend(d) || isHoliday(d)); } // 특근: 주말·공휴일 근무
function jgEligible(d, g){ return !isWorkerOff(d, g) && isWeekend(d); }                   // 지근: 주말 근무
function jhEligible(d, g){ return  isWorkerOff(d, g) && isWeekday(d) && !isHoliday(d); }  // 지휴: 평일 휴무

function computeAutoTags(group, year, month){
  const ym = `${year}-${pad(month+1)}`;
  const dim = new Date(year, month+1, 0).getDate();
  const out = {};
  const weekendWork = [], weekdayOff = [], weekdayHolidayWork = [];
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    const off = isWorkerOff(ds, group);
    if(!off && isWeekend(ds)) weekendWork.push(ds);                              // 주말 근무
    else if(!off && isWeekday(ds) && isHoliday(ds)) weekdayHolidayWork.push(ds); // 평일 공휴일 근무
    if(off && isWeekday(ds) && !isHoliday(ds)) weekdayOff.push(ds);              // 평일 휴무
  }
  const W = weekdayOff.length;                                  // 지휴 = 평일 휴무 전부 → 지근 개수의 기준
  weekdayOff.forEach(ds => { out[ds] = 'JH'; });               // 지휴
  weekendWork.slice(0, W).forEach(ds => { out[ds] = 'JG'; });  // 지근 = 지휴 개수만큼, 가장 앞 주말근무부터
  weekdayHolidayWork.forEach(ds => { out[ds] = 'TG'; });       // 특근: 평일 공휴일 근무
  weekendWork.slice(W).forEach(ds => { out[ds] = 'TG'; });     // 특근: 지근으로 못 쓴 나머지 주말근무
  return out;
}
// 자동 + 수동(우선) 병합 후 종류별 번호 부여 → { date: {tag, n} }
function tagsForMonth(group, year, month){
  const ym = `${year}-${pad(month+1)}`;
  const dim = new Date(year, month+1, 0).getDate();
  const gd = desigMapFor(group);
  const auto = computeAutoTags(group, year, month);
  const counts = { TG:0, JG:0, JH:0 };
  const out = {};
  for(let d=1; d<=dim; d++){
    const ds = `${ym}-${pad(d)}`;
    let tag = auto[ds] || null;
    if(gd[ds]) tag = (gd[ds] === 'NONE') ? null : gd[ds];  // 수동 우선
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
function memoPreview(text, limit = 6){
  const s = String(text || '').trim();
  return s.length > limit ? `${s.slice(0, limit)}...` : s;
}

/* ---------- 렌더링 ---------- */
const $ = (id) => document.getElementById(id);

function renderWeekdays(){
  $('weekdays').innerHTML = WEEK.map((w,i)=>
    `<div class="wd ${i===0?'sun':''} ${i===6?'sat':''}">${w}</div>`
  ).join('');
}

function renderGroupSwitcher(){
  const group = currentGroup();
  const label = $('activeGroupLabel');
  if(label) label.textContent = `${group}조`;
  $('groupTabs').innerHTML = GROUPS.map(g =>
    `<button class="group-tab${g===group?' active':''}" data-group="${g}" aria-pressed="${g===group}">
      ${g}조
    </button>`
  ).join('');
}

function renderTodayBanner(){
  const el = $('todayBanner');
  const d = new Date();
  const wd = WEEK[d.getDay()];
  const today = todayStr();
  const group = currentGroup();
  const key = shiftFor(today, group);
  const t = st(key);
  const shiftDay = shiftDayText(today, group);
  const dateLabel = `오늘 ${d.getMonth()+1}월 ${d.getDate()}일 (${wd}) · ${group}조 기준`;
  if(!t){
    el.style.setProperty('--accent', '#94a3b8');
    el.innerHTML = `<div class="tb-left"><div class="tb-date">${dateLabel}</div>
      <div class="tb-shift">근무 미설정</div></div>`;
    return;
  }
  el.style.setProperty('--accent', t.color);
  el.innerHTML = `
    <div class="tb-left">
      <div class="tb-date">${dateLabel}</div>
      <div class="tb-shift"><span class="tb-badge" style="background:${t.color}">${group}조 ${t.label}</span></div>
    </div>
    <div class="tb-time">${shiftDay ? `${shiftDay} · ` : ''}${timeText(t)}</div>`;
}

function renderTeamBoard(){
  const el = $('teamBoard');
  if(!el) return;
  const today = todayStr();
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
    </button>`;
  }).join('');
  el.innerHTML = `
    <div class="team-head">
      <span>A/B/C/D 오늘 배치</span>
      <b>${BASE_DATE} 기준</b>
    </div>
    <div class="team-grid">${items}</div>`;
}

function renderCalendar(){
  const group = currentGroup();
  $('monthTitle').textContent = `${view.year}년 ${view.month+1}월 · ${group}조`;
  const startDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const todayS = todayStr();
  const rangeSet = sheetRange ? new Set(rangeDays(sheetRange.start, sheetRange.end)) : null;
  const memos = memosFor(group);
  const tagMap = tagsForMonth(group, view.year, view.month);
  let html = '';
  for(let i=0; i<startDow; i++) html += `<div class="cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const dow = new Date(view.year, view.month, d).getDay();
    const t = st(shiftFor(dateStr, group));
    const tint = t ? hexToTint(t.color) : 'transparent';
    const badge = t
      ? `<span class="badge" style="background:${t.color}">${t.short || t.label}</span>`
      : `<span class="badge none">-</span>`;
    const dnumCls = holidayName(dateStr) ? 'sun' : (dow===0 ? 'sun' : (dow===6 ? 'sat' : ''));
    const memo = memos[dateStr];
    const hasMemo = !!memo;
    const selCls = `${rangeAnchor===dateStr ? ' range-anchor' : ''}${rangeSet && rangeSet.has(dateStr) ? ' range-sel' : ''}`;
    const ti = tagMap[dateStr];
    const hasTag = !!ti;
    const tagHtml = ti
      ? `<span class="cell-tag" style="background:${DESIG[ti.tag].color}">${tagLabel(ti)}</span>`
      : '<span class="cell-tag-slot" aria-hidden="true"></span>';
    html += `<button class="cell ${dateStr===todayS?'today':''}${hasMemo?' has-memo':''}${hasTag?' has-tag':''}${selCls}" data-date="${dateStr}" style="--tint:${tint}">
      <span class="dnum ${dnumCls}">${d}</span>
      ${badge}
      ${tagHtml}
      ${isOverride(dateStr, group) ? '<span class="dot-ov"></span>' : ''}
      ${memo ? `<span class="memo-pin" aria-hidden="true"></span><span class="cell-memo" title="${escapeHtml(memo)}">${escapeHtml(memoPreview(memo))}</span>` : ''}
    </button>`;
  }
  $('grid').innerHTML = html;
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
  $('legend').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    if(!t) return '';
    return `<span class="lg"><span class="lg-dot" style="background:${t.color}"></span>${t.label}</span>`;
  }).join('');
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

function renderAll(){ renderGroupSwitcher(); renderTodayBanner(); renderTeamBoard(); renderCalendar(); renderLegend(); }

/* ---------- 범위(여러 날) 선택 ---------- */
function rangeDays(a, b){
  let s = a, e = b;
  if(dayDiff(a, b) < 0){ s = b; e = a; }
  const out = [], n = dayDiff(s, e), start = parseYmd(s);
  for(let i=0; i<=n; i++){ const d = new Date(start); d.setDate(d.getDate()+i); out.push(ymd(d)); }
  return out;
}
function startRange(dateStr){
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
  if(hol || ti){ sh.hidden = false; sh.innerHTML = `${hol ? '🔴 ' + hol : ''}${ti ? ' <b>' + tagLabel(ti) + '</b>' : ''}`; }
  else { sh.hidden = true; sh.innerHTML = ''; }
  document.querySelector('.sheet-hint').innerHTML = '이 날의 근무를 선택하세요. (패턴과 다르게 바꾸면 <b>수동 변경</b>으로 표시)';
  const current = shiftFor(dateStr, group);
  $('sheetOptions').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    const allowed = canPlace(key, dateStr, group);
    const note = allowed ? timeText(t) : (t.special === 'desigOff' ? '근무일에만' : '휴무일에만');
    return `<button class="opt ${key===current?'selected':''} ${allowed?'':'opt-disabled'}" data-code="${key}" ${allowed?'':'disabled'} style="--c:${t.color}">
      <span class="opt-badge" style="background:${t.color}">${t.short || t.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${t.label}</span>
      <span class="opt-time">${note}</span></span>
    </button>`;
  }).join('');
  renderSheetDesig(dateStr, group);
  $('sheetMemo').value = memosFor(group)[dateStr] || '';
  updateMemoCount($('sheetMemo').value);
  $('btnRevert').textContent = '↺ 패턴 값으로 되돌리기';
  $('btnRevert').hidden = !isOverride(dateStr, group);
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
  const group = currentGroup();
  if(sheetRange){  // 범위 모드: 기간 내 모든 날에 적용(가능한 날만)
    const overrides = groupOverrideMap(group);
    rangeDays(sheetRange.start, sheetRange.end).forEach(ds=>{
      if(!canPlace(key, ds, group)) return;
      if(key === groupShiftFor(ds, group)) delete overrides[ds];
      else overrides[ds] = key;
    });
    saveState();
    renderCalendar(); renderTodayBanner(); renderTeamBoard();
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
  renderTodayBanner();
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
    <div class="desig-hint">특근=평일 공휴일 근무 / 지근=주말 근무 / 지휴=평일 휴무</div>`;
}
function setDesig(tag){
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
  renderCalendar(); renderTodayBanner(); renderTeamBoard();
}

// 특근/지근/지휴는 전부 자동 계산 (개수 입력칸 제거)

function updateMemoCount(value = $('sheetMemo').value){
  const el = $('memoCount');
  if(!el) return;
  el.textContent = `${String(value || '').length}/80`;
}

function saveMemoValue(value){
  const v = String(value || '').trim();
  const memos = memosFor();
  if(sheetRange){
    rangeDays(sheetRange.start, sheetRange.end).forEach(ds=>{ if(v) memos[ds]=v; else delete memos[ds]; });
    saveState(); renderCalendar();
    return;
  }
  if(!selectedDate) return;
  if(v) memos[selectedDate] = v; else delete memos[selectedDate];
  saveState(); renderCalendar();
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
}

function addShiftType(){
  let n = 1, key = 'C1';
  while(state.shiftTypes[key]){ n++; key = 'C' + n; }
  state.shiftTypes[key] = { label:'새 근무', short:'?', start:'09:00', end:'18:00', color:'#64748b' };
  state.shiftOrder.push(key);
  saveState(); renderSettings(); renderAll();
}
function removeShiftType(key){
  if(state.shiftOrder.length <= 1) return;
  const t = state.shiftTypes[key];
  if(!confirm(`'${t ? t.label : key}' 근무를 삭제할까요?\n(달력에서 이 근무로 지정된 날은 비워집니다)`)) return;
  delete state.shiftTypes[key];
  state.shiftOrder = state.shiftOrder.filter(k => k !== key);
  state.pattern.cycle = state.pattern.cycle.filter(k => k !== key);
  for(const group of GROUPS){
    const overrides = groupOverrideMap(group);
    for(const dt in overrides){ if(overrides[dt] === key) delete overrides[dt]; }
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `교대캘린더-백업-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
}
function importData(file){
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

/* ---------- 이벤트 연결 ---------- */
function wire(){
  // 내 조 선택
  $('groupTabs').addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-group]');
    if(btn) selectGroup(btn.dataset.group);
  });
  $('teamBoard').addEventListener('click', (e)=>{
    const card = e.target.closest('[data-group]');
    if(card) selectGroup(card.dataset.group);
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
      saveState(); renderCalendar(); renderTodayBanner(); renderTeamBoard();
      openRangeSheet(sheetRange.start, sheetRange.end);
      return;
    }
    if(selectedDate){
      delete groupOverrideMap(group)[selectedDate];
      saveState(); openDaySheet(selectedDate); renderCalendar(); renderTodayBanner(); renderTeamBoard();
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

  // 근무 종류: 추가/삭제(클릭) + 수정(입력)
  $('setShiftTypes').addEventListener('click', (e)=>{
    if(e.target.id === 'btnAddType') addShiftType();
    else if(e.target.dataset.del !== undefined) removeShiftType(e.target.dataset.del);
  });
  function onShiftTypeEdit(e){
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
    const key = e.target.dataset.add;
    if(!key) return;
    state.pattern.cycle.push(key);
    saveState(); renderPatternChips(); renderAll();
  });
  $('btnClearPattern').onclick = () => {
    if(confirm('반복 패턴을 모두 비울까요?')){ state.pattern.cycle = []; saveState(); renderPatternChips(); renderAll(); }
  };
  $('btnDefaultPattern').onclick = () => {
    state.pattern.cycle = clone(DEFAULT_CYCLE);
    saveState(); renderPatternChips(); renderAll();
  };

  // 패턴 시작일
  $('startDate').addEventListener('change', (e)=>{
    state.pattern.startDate = e.target.value || todayStr();
    saveState(); renderAll();
  });

  // 데이터
  $('btnExport').onclick = exportData;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', (e)=>{ if(e.target.files[0]) importData(e.target.files[0]); e.target.value=''; });
  $('btnReset').onclick = () => {
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
