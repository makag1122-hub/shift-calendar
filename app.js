'use strict';

/* ============================================================
   교대 캘린더 — 변형 4조 3교대 (D / S / G / O / D2 / G2 / 휴)
   - 근무 종류 자유 커스텀(추가·삭제·수정)
   - 반복 패턴(사이클) 자동 계산 + 날짜별 수동 변경(override)
   - 데이터는 localStorage 저장
   ============================================================ */

const STORAGE_KEY = 'shiftcal.v2';

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

const WEEK = ['일','월','화','수','목','금','토'];

/* ---------- 공휴일(빨간날) ----------
   출처: publicholidays.co.kr / gyesan.co.kr (2026년 법정공휴일 19일, 제헌절 제외) */
const HOLIDAYS = {
  '2026-01-01':'신정',
  '2026-02-16':'설날','2026-02-17':'설날','2026-02-18':'설날',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날','2026-05-25':'부처님오신날 대체',
  '2026-06-06':'현충일',
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
  version: 3,
  shiftOrder: ['D','S','G','O','D2','G2','OFF','JG','JH'],
  shiftTypes: {
    D:   { label:'DAY',  short:'D',  start:'06:00', end:'14:00', color:'#f59e0b', kind:'work' },
    S:   { label:'SW',   short:'S',  start:'14:00', end:'22:00', color:'#10b981', kind:'work' },
    G:   { label:'GY',   short:'G',  start:'22:00', end:'06:00', color:'#6366f1', kind:'work' },
    O:   { label:'오피스', short:'O',  start:'09:00', end:'18:00', color:'#0ea5e9', kind:'work' },
    D2:  { label:'DAY2', short:'D2', start:'06:00', end:'18:00', color:'#fb923c', kind:'work' },
    G2:  { label:'GY2',  short:'G2', start:'18:00', end:'06:00', color:'#a78bfa', kind:'work' },
    OFF: { label:'휴무', short:'휴', start:'',      end:'',      color:'#94a3b8', kind:'off'  },
    // 특수근무: 배치 규칙 있음 (special)
    JG:  { label:'지정근무', short:'지근', start:'', end:'', color:'#ef4444', kind:'work', special:'desigWork' }, // 휴무일에만
    JH:  { label:'지정휴무', short:'지휴', start:'', end:'', color:'#0d9488', kind:'off',  special:'desigOff'  }, // 근무일에만
  },
  pattern: {
    // 20일 주기: D×5 · 휴×2 · S×5 · 휴×1 · G×5 · 휴×2
    cycle: ['D','D','D','D','D','OFF','OFF','S','S','S','S','S','OFF','G','G','G','G','G','OFF','OFF'],
    startDate: todayStr(),   // 이 날짜 = cycle[0] (첫 D) — 실제 시작일로 맞춰야 함
  },
  overrides: {},  // { 'YYYY-MM-DD': shiftKey }
  memos: {},      // { 'YYYY-MM-DD': '메모' }
};
const DEFAULT_CYCLE = ['D','D','D','D','D','OFF','OFF','S','S','S','S','S','OFF','G','G','G','G','G','OFF','OFF'];

/* ---------- 상태 로드/저장 ---------- */
function clone(o){ return JSON.parse(JSON.stringify(o)); }

function migrate(s){
  const base = clone(DEFAULT_STATE);
  const out = clone(base);
  if(s && typeof s === 'object'){
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
    out.overrides = s.overrides || {};
    out.memos = s.memos || {};
  }
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
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('저장 실패', e); }
}

let state = loadState();
let view = { year: new Date().getFullYear(), month: new Date().getMonth() }; // month: 0-11
let selectedDate = null;

/* ---------- 근무 계산 ---------- */
function patternShiftFor(dateStr){
  const cycle = state.pattern.cycle;
  if(!cycle || !cycle.length) return null;
  let idx = dayDiff(state.pattern.startDate, dateStr) % cycle.length;
  if(idx < 0) idx += cycle.length;
  return cycle[idx];
}
function isOverride(dateStr){ return Object.prototype.hasOwnProperty.call(state.overrides, dateStr); }
function shiftFor(dateStr){
  const key = isOverride(dateStr) ? state.overrides[dateStr] : patternShiftFor(dateStr);
  return state.shiftTypes[key] ? key : null;  // 삭제된 근무 key 면 null
}
function st(key){ return key ? state.shiftTypes[key] : null; }
function isNextDay(t){ return !!(t && t.start && t.end && t.end <= t.start); } // 예: 22:00 → 06:00
function timeText(t){
  if(!t) return '';
  if(t.start) return `${t.start} ~ ${t.end}${isNextDay(t) ? ' (익일)' : ''}`;
  return (t.kind === 'work') ? '근무' : '쉬는 날';
}
// 특수근무 배치 규칙: 지정휴무(지휴)는 '근무일'에만, 지정근무(지근)는 '휴무일'에만
function patternKind(dateStr){
  const t = state.shiftTypes[patternShiftFor(dateStr)];
  return t ? (t.kind || 'work') : 'off';
}
function canPlace(key, dateStr){
  const t = state.shiftTypes[key];
  if(!t || !t.special) return true;          // 일반 근무는 제한 없음
  const baseWork = patternKind(dateStr) === 'work';
  if(t.special === 'desigOff')  return baseWork;   // 지휴: 근무일에만
  if(t.special === 'desigWork') return !baseWork;  // 지근: 휴무일에만
  return true;
}
// 특근: 빨간날(공휴일)에 '근무'하면 자동 특근
function isSpecialWork(dateStr){
  if(!isHoliday(dateStr)) return false;
  const t = state.shiftTypes[shiftFor(dateStr)];
  return !!(t && t.kind === 'work');
}
function hexToTint(hex, alpha = 0.14){
  const h = (hex || '#000000').replace('#','');
  const r = parseInt(h.substring(0,2),16) || 0;
  const g = parseInt(h.substring(2,4),16) || 0;
  const b = parseInt(h.substring(4,6),16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- 렌더링 ---------- */
const $ = (id) => document.getElementById(id);

function renderWeekdays(){
  $('weekdays').innerHTML = WEEK.map((w,i)=>
    `<div class="wd ${i===0?'sun':''} ${i===6?'sat':''}">${w}</div>`
  ).join('');
}

function renderTodayBanner(){
  const el = $('todayBanner');
  const d = new Date();
  const wd = WEEK[d.getDay()];
  const key = shiftFor(todayStr());
  const t = st(key);
  const dateLabel = `오늘 ${d.getMonth()+1}월 ${d.getDate()}일 (${wd})`;
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
      <div class="tb-shift"><span class="tb-badge" style="background:${t.color}">${t.label}</span></div>
    </div>
    <div class="tb-time">${timeText(t)}</div>`;
}

function renderCalendar(){
  $('monthTitle').textContent = `${view.year}년 ${view.month+1}월`;
  const startDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const todayS = todayStr();
  let html = '';
  for(let i=0; i<startDow; i++) html += `<div class="cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const dow = new Date(view.year, view.month, d).getDay();
    const t = st(shiftFor(dateStr));
    const tint = t ? hexToTint(t.color) : 'transparent';
    const badge = t
      ? `<span class="badge" style="background:${t.color}">${t.short || t.label}</span>`
      : `<span class="badge none">-</span>`;
    const dnumCls = holidayName(dateStr) ? 'sun' : (dow===0 ? 'sun' : (dow===6 ? 'sat' : ''));
    html += `<button class="cell ${dateStr===todayS?'today':''}" data-date="${dateStr}" style="--tint:${tint}">
      <span class="dnum ${dnumCls}">${d}</span>
      ${badge}
      ${isSpecialWork(dateStr) ? '<span class="tag-teuk">특근</span>' : ''}
      ${isOverride(dateStr) ? '<span class="dot-ov"></span>' : ''}
      ${state.memos[dateStr] ? '<span class="dot-memo"></span>' : ''}
    </button>`;
  }
  $('grid').innerHTML = html;
  renderSummary();
}

function renderLegend(){
  $('legend').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    if(!t) return '';
    return `<span class="lg"><span class="lg-dot" style="background:${t.color}"></span>${t.label}</span>`;
  }).join('');
}

function renderSummary(){
  const dim = new Date(view.year, view.month+1, 0).getDate();
  let work=0, off=0, jg=0, jh=0, teuk=0;
  for(let d=1; d<=dim; d++){
    const ds = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const key = shiftFor(ds);
    const t = state.shiftTypes[key];
    if(key === 'JG') jg++;
    if(key === 'JH') jh++;
    if(t && t.kind === 'work') work++; else off++;
    if(isSpecialWork(ds)) teuk++;
  }
  $('summary').innerHTML =
    `<span class="sm sm-work">근무 <b>${work}</b></span>` +
    `<span class="sm sm-off">휴무 <b>${off}</b></span>` +
    `<span class="sm sm-teuk">특근 <b>${teuk}</b></span>` +
    `<span class="sm sm-jg">지근 <b>${jg}</b></span>` +
    `<span class="sm sm-jh">지휴 <b>${jh}</b></span>`;
}

function renderAll(){ renderTodayBanner(); renderCalendar(); renderLegend(); }

/* ---------- 날짜 편집 시트 ---------- */
function openDaySheet(dateStr){
  selectedDate = dateStr;
  const d = parseYmd(dateStr);
  $('sheetDate').textContent = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  const hol = holidayName(dateStr), teuk = isSpecialWork(dateStr);
  const sh = $('sheetHoliday');
  if(hol || teuk){ sh.hidden = false; sh.innerHTML = `${hol ? '🔴 ' + hol : ''}${teuk ? ' <b>특근</b>' : ''}`; }
  else { sh.hidden = true; sh.innerHTML = ''; }
  const current = shiftFor(dateStr);
  $('sheetOptions').innerHTML = state.shiftOrder.map(key=>{
    const t = state.shiftTypes[key];
    const allowed = canPlace(key, dateStr);
    const note = allowed ? timeText(t) : (t.special === 'desigOff' ? '근무일에만' : '휴무일에만');
    return `<button class="opt ${key===current?'selected':''} ${allowed?'':'opt-disabled'}" data-code="${key}" ${allowed?'':'disabled'} style="--c:${t.color}">
      <span class="opt-badge" style="background:${t.color}">${t.short || t.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${t.label}</span>
      <span class="opt-time">${note}</span></span>
    </button>`;
  }).join('');
  $('sheetMemo').value = state.memos[dateStr] || '';
  $('btnRevert').hidden = !isOverride(dateStr);
  $('dayBackdrop').hidden = false;
  $('daySheet').hidden = false;
}
function closeDaySheet(){
  $('dayBackdrop').hidden = true;
  $('daySheet').hidden = true;
  selectedDate = null;
  renderAll();
}
function setShift(key){
  if(!selectedDate) return;
  if(!canPlace(key, selectedDate)) return;  // 못 넣는 자리 차단
  if(key === patternShiftFor(selectedDate)) delete state.overrides[selectedDate];
  else state.overrides[selectedDate] = key;
  saveState();
  openDaySheet(selectedDate);
  renderCalendar();
  renderTodayBanner();
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
  for(const dt in state.overrides){ if(state.overrides[dt] === key) delete state.overrides[dt]; }
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

/* ---------- 이벤트 연결 ---------- */
function wire(){
  // 월 이동
  $('btnPrev').onclick = () => { if(--view.month < 0){ view.month=11; view.year--; } renderCalendar(); };
  $('btnNext').onclick = () => { if(++view.month > 11){ view.month=0; view.year++; } renderCalendar(); };
  $('btnToday').onclick = () => { const n=new Date(); view={year:n.getFullYear(), month:n.getMonth()}; renderCalendar(); };

  // 날짜 셀 클릭
  $('grid').addEventListener('click', (e)=>{
    const cell = e.target.closest('.cell');
    if(!cell || cell.classList.contains('empty')) return;
    openDaySheet(cell.dataset.date);
  });

  // 시트
  $('dayBackdrop').onclick = closeDaySheet;
  $('btnCloseSheet').onclick = closeDaySheet;
  $('btnRevert').onclick = () => {
    if(selectedDate){ delete state.overrides[selectedDate]; saveState(); openDaySheet(selectedDate); renderCalendar(); }
  };
  $('sheetOptions').addEventListener('click', (e)=>{
    const opt = e.target.closest('.opt');
    if(opt) setShift(opt.dataset.code);
  });
  $('sheetMemo').addEventListener('input', (e)=>{
    if(!selectedDate) return;
    const v = e.target.value.trim();
    if(v) state.memos[selectedDate] = v; else delete state.memos[selectedDate];
    saveState();
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
