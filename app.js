'use strict';

/* ============================================================
   교대 캘린더 — 변형 4조 3교대 (DAY / SW / GY) 대응
   - 반복 패턴(사이클) 자동 계산 + 날짜별 수동 변경(override)
   - 데이터는 localStorage 에 저장
   ============================================================ */

const STORAGE_KEY = 'shiftcal.v1';

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

/* ---------- 기본 상태 ----------
   ※ 시간/패턴은 사용자가 설정에서 자유롭게 바꿀 수 있는 "기본값"입니다. */
const DEFAULT_STATE = {
  version: 1,
  shiftOrder: ['DAY','SW','GY','OFF'],
  shiftTypes: {
    DAY: { label:'주간', short:'주', start:'06:00', end:'14:00', color:'#f59e0b' },
    SW:  { label:'스윙', short:'S',  start:'14:00', end:'22:00', color:'#10b981' },
    GY:  { label:'야간', short:'야', start:'22:00', end:'06:00', color:'#6366f1' },
    OFF: { label:'휴무', short:'휴', start:'',      end:'',      color:'#94a3b8' },
  },
  pattern: {
    cycle: ['DAY','DAY','SW','SW','GY','GY','OFF','OFF'],
    startDate: todayStr(),   // 이 날짜 = cycle[0]
  },
  overrides: {},  // { 'YYYY-MM-DD': shiftCode }
  memos: {},      // { 'YYYY-MM-DD': '메모' }
};

/* ---------- 상태 로드/저장 ---------- */
function clone(o){ return JSON.parse(JSON.stringify(o)); }

function migrate(s){
  const base = clone(DEFAULT_STATE);
  const merged = {
    ...base, ...s,
    shiftTypes: { ...base.shiftTypes, ...(s.shiftTypes || {}) },
    pattern:    { ...base.pattern,    ...(s.pattern || {}) },
    overrides:  s.overrides || {},
    memos:      s.memos || {},
    shiftOrder: Array.isArray(s.shiftOrder) ? s.shiftOrder : base.shiftOrder,
  };
  if(!Array.isArray(merged.pattern.cycle)) merged.pattern.cycle = base.pattern.cycle;
  if(!merged.pattern.startDate) merged.pattern.startDate = todayStr();
  return merged;
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
function isOverride(dateStr){
  return Object.prototype.hasOwnProperty.call(state.overrides, dateStr);
}
function shiftFor(dateStr){
  if(isOverride(dateStr)) return state.overrides[dateStr];
  return patternShiftFor(dateStr);
}
function isNextDay(st){
  return !!(st && st.start && st.end && st.end <= st.start); // 예: 22:00 → 06:00
}
function timeText(st){
  if(!st || !st.start) return '쉬는 날';
  return `${st.start} ~ ${st.end}${isNextDay(st) ? ' (익일)' : ''}`;
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
  const ts = todayStr();
  const d = new Date();
  const wd = WEEK[d.getDay()];
  const code = shiftFor(ts);
  const st = code ? state.shiftTypes[code] : null;
  const dateLabel = `오늘 ${d.getMonth()+1}월 ${d.getDate()}일 (${wd})`;
  if(!st){
    el.style.setProperty('--accent', '#94a3b8');
    el.innerHTML = `<div class="tb-left"><div class="tb-date">${dateLabel}</div>
      <div class="tb-shift">근무 미설정</div></div>`;
    return;
  }
  el.style.setProperty('--accent', st.color);
  el.innerHTML = `
    <div class="tb-left">
      <div class="tb-date">${dateLabel}</div>
      <div class="tb-shift"><span class="tb-badge" style="background:${st.color}">${st.label}</span></div>
    </div>
    <div class="tb-time">${timeText(st)}</div>`;
}

function renderCalendar(){
  $('monthTitle').textContent = `${view.year}년 ${view.month+1}월`;
  const grid = $('grid');
  const startDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month+1, 0).getDate();
  const todayS = todayStr();
  let html = '';
  for(let i=0; i<startDow; i++) html += `<div class="cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${view.year}-${pad(view.month+1)}-${pad(d)}`;
    const dow = new Date(view.year, view.month, d).getDay();
    const code = shiftFor(dateStr);
    const st = code ? state.shiftTypes[code] : null;
    const tint = st ? hexToTint(st.color) : 'transparent';
    const badge = st
      ? `<span class="badge" style="background:${st.color}">${st.short || st.label}</span>`
      : `<span class="badge none">-</span>`;
    html += `<button class="cell ${dateStr===todayS?'today':''}" data-date="${dateStr}" style="--tint:${tint}">
      <span class="dnum ${dow===0?'sun':''} ${dow===6?'sat':''}">${d}</span>
      ${badge}
      ${isOverride(dateStr) ? '<span class="dot-ov"></span>' : ''}
      ${state.memos[dateStr] ? '<span class="dot-memo"></span>' : ''}
    </button>`;
  }
  grid.innerHTML = html;
}

function renderLegend(){
  $('legend').innerHTML = state.shiftOrder.map(code=>{
    const st = state.shiftTypes[code];
    if(!st) return '';
    return `<span class="lg"><span class="lg-dot" style="background:${st.color}"></span>${st.label}</span>`;
  }).join('');
}

function renderAll(){
  renderTodayBanner();
  renderCalendar();
  renderLegend();
}

/* ---------- 날짜 편집 시트 ---------- */
function openDaySheet(dateStr){
  selectedDate = dateStr;
  const d = parseYmd(dateStr);
  $('sheetDate').textContent = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  const current = shiftFor(dateStr);
  $('sheetOptions').innerHTML = state.shiftOrder.map(code=>{
    const st = state.shiftTypes[code];
    return `<button class="opt ${code===current?'selected':''}" data-code="${code}" style="--c:${st.color}">
      <span class="opt-badge" style="background:${st.color}">${st.short || st.label}</span>
      <span class="opt-textwrap"><span class="opt-label">${st.label}</span>
      <span class="opt-time">${st.start ? `${st.start}~${st.end}` : '쉬는 날'}</span></span>
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
function setShift(code){
  if(!selectedDate) return;
  // 패턴 값과 같으면 override 를 굳이 저장하지 않음(자동 패턴 유지)
  if(code === patternShiftFor(selectedDate)) delete state.overrides[selectedDate];
  else state.overrides[selectedDate] = code;
  saveState();
  openDaySheet(selectedDate); // 시트 갱신(선택 표시/되돌리기 버튼)
  renderCalendar();
  renderTodayBanner();
}

/* ---------- 설정 화면 ---------- */
function renderSettings(){
  // 근무 종류
  $('setShiftTypes').innerHTML = state.shiftOrder.map(code=>{
    const st = state.shiftTypes[code];
    const off = (code === 'OFF');
    return `<div class="st-row" data-code="${code}">
      <input class="st-color" type="color" value="${st.color}" data-field="color" />
      <input class="st-label" type="text" value="${st.label}" data-field="label" maxlength="6" />
      <input class="st-time" type="time" value="${st.start}" data-field="start" ${off?'disabled':''} />
      <span class="st-sep">~</span>
      <input class="st-time" type="time" value="${st.end}" data-field="end" ${off?'disabled':''} />
    </div>`;
  }).join('');
  renderPatternChips();
  renderPatternAdd();
  $('startDate').value = state.pattern.startDate;
}

function renderPatternChips(){
  const cycle = state.pattern.cycle;
  if(!cycle.length){
    $('patternChips').innerHTML = '<span class="muted">패턴이 비어 있어요. 아래에서 근무를 추가하세요.</span>';
    return;
  }
  $('patternChips').innerHTML = cycle.map((code,i)=>{
    const st = state.shiftTypes[code];
    return `<span class="chip" style="--c:${st.color}">
      <button class="chip-mv" data-mv="-1" data-i="${i}" aria-label="왼쪽">‹</button>
      <span class="chip-badge" style="background:${st.color}">${st.short || st.label}</span>
      <button class="chip-mv" data-mv="1" data-i="${i}" aria-label="오른쪽">›</button>
      <button class="chip-x" data-x="${i}" aria-label="삭제">×</button>
    </span>`;
  }).join('');
}
function renderPatternAdd(){
  $('patternAdd').innerHTML = state.shiftOrder.map(code=>{
    const st = state.shiftTypes[code];
    return `<button class="add-btn" data-add="${code}" style="background:${st.color}">+ ${st.label}</button>`;
  }).join('');
}

function openSettings(){ renderSettings(); $('settingsModal').hidden = false; }
function closeSettings(){ $('settingsModal').hidden = true; renderAll(); }

/* ---------- 데이터 백업 ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `교대캘린더-백업-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      state = migrate(JSON.parse(reader.result));
      saveState();
      renderSettings();
      renderAll();
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

  // 근무 종류 편집
  $('setShiftTypes').addEventListener('input', (e)=>{
    const row = e.target.closest('.st-row'); if(!row) return;
    const code = row.dataset.code, field = e.target.dataset.field;
    state.shiftTypes[code][field] = e.target.value;
    saveState();
    renderPatternChips(); renderPatternAdd(); // 색/이름 즉시 반영
  });

  // 패턴 칩(이동/삭제)
  $('patternChips').addEventListener('click', (e)=>{
    const cycle = state.pattern.cycle;
    if(e.target.dataset.x !== undefined){
      cycle.splice(Number(e.target.dataset.x), 1);
    } else if(e.target.dataset.mv !== undefined){
      const i = Number(e.target.dataset.i), j = i + Number(e.target.dataset.mv);
      if(j >= 0 && j < cycle.length){ [cycle[i], cycle[j]] = [cycle[j], cycle[i]]; }
    } else return;
    saveState(); renderPatternChips();
  });
  // 패턴에 근무 추가
  $('patternAdd').addEventListener('click', (e)=>{
    const code = e.target.dataset.add;
    if(!code) return;
    state.pattern.cycle.push(code);
    saveState(); renderPatternChips();
  });
  $('btnClearPattern').onclick = () => {
    if(confirm('반복 패턴을 모두 비울까요?')){ state.pattern.cycle = []; saveState(); renderPatternChips(); }
  };

  // 패턴 시작일
  $('startDate').addEventListener('change', (e)=>{
    state.pattern.startDate = e.target.value || todayStr();
    saveState();
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
