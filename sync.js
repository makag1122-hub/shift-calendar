'use strict';

/* ============================================================
   실시간 공유 (여자친구 보기 전용)
   - 소유자(owner)가 저장할 때마다 클라우드에 자동 push
   - 보기(viewer)는 구독해서 자동 반영 (읽기 전용)
   - 저장소: 본인 소유의 무료 Firebase Firestore (구글계정)
   - 익명 공용 저장소를 쓰지 않아 링크를 아는 사람만 접근
   app.js 보다 먼저 로드되며, 실제 동작은 app.js 로드 후 Sync.init()에서 시작됩니다.
   ============================================================ */
(function(){
  const SYNC_KEY = 'shiftcal.sync';   // localStorage: { config, code, role }
  const SDK_APP = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  const SDK_FS  = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

  let cfg = null;        // { config:{...}, code:'xxxx', role:'owner'|'viewer' }
  let fb = null;         // { db, doc, setDoc, onSnapshot }
  let docRef = null;
  let unsub = null;
  let pushTimer = null;
  let status = 'off';    // off | connecting | live | readonly | error
  let lastError = '';
  let lastUpdated = 0;   // 마지막으로 클라우드에 반영된 시각(ms) — viewer는 원격, owner는 내 push

  /* ---------- 저장/불러오기 ---------- */
  function loadCfg(){ try{ return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); }catch(e){ return null; } }
  function saveCfg(c){ try{ localStorage.setItem(SYNC_KEY, JSON.stringify(c)); }catch(e){} }
  function clearCfg(){ try{ localStorage.removeItem(SYNC_KEY); }catch(e){} }

  /* ---------- Firebase 설정 파싱(JSON/JS 스니펫 모두 허용) ---------- */
  function parseConfig(text){
    if(!text) return null;
    let s = String(text).trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if(a >= 0 && b > a) s = s.slice(a, b+1);
    try{ return JSON.parse(s); }catch(e){}
    try{
      const j = s
        .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')  // 키에 따옴표
        .replace(/'/g, '"')                                     // 홑→겹따옴표
        .replace(/,(\s*[}\]])/g, '$1');                         // 트레일링 콤마 제거
      return JSON.parse(j);
    }catch(e){ return null; }
  }
  function validConfig(c){ return !!(c && c.apiKey && c.projectId); }

  function randomCode(){
    const s = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    const arr = crypto.getRandomValues(new Uint8Array(14));
    for(const n of arr) out += s[n % s.length];
    return out;
  }

  function setStatus(s, err){
    status = s; lastError = err || '';
    if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
  }

  /* ---------- Firebase 로드/초기화 ---------- */
  async function ensureFirebase(config){
    if(fb) return fb;
    const appMod = await import(SDK_APP);
    const fsMod  = await import(SDK_FS);
    // 설정을 다시 넣는 경우 기존 앱을 지우고 재초기화(중복 앱 오류 방지)
    const apps = appMod.getApps ? appMod.getApps() : [];
    if(apps.length && appMod.deleteApp){ try{ await appMod.deleteApp(apps[0]); }catch(e){} }
    const app = appMod.initializeApp(config);
    const db  = fsMod.getFirestore(app);
    fb = { db, doc: fsMod.doc, setDoc: fsMod.setDoc, onSnapshot: fsMod.onSnapshot };
    return fb;
  }

  async function connect(){
    if(!cfg || !validConfig(cfg.config)){ setStatus('off'); return; }
    setStatus('connecting');
    try{
      const f = await ensureFirebase(cfg.config);
      docRef = f.doc(f.db, 'calendars', cfg.code);
      if(cfg.role === 'viewer'){
        unsub = f.onSnapshot(docRef,
          (snap)=>{ const d = snap.data(); if(d){ if(d.state) applyRemoteState(d.state); if(d.updatedAt) lastUpdated = d.updatedAt; } setStatus('readonly'); },
          (err)=>{ setStatus('error', friendly(err)); });
      }else{
        await pushNow();          // 최초 1회 현재 상태 업로드(문서 생성)
        setStatus('live');
      }
    }catch(e){ setStatus('error', friendly(e)); }
  }

  function friendly(e){
    const m = (e && (e.code || e.message)) ? (e.code || e.message) : String(e);
    if(/permission-denied/i.test(m)) return '권한 거부됨 — Firestore 보안 규칙을 확인해 주세요.';
    if(/failed to fetch|network|offline/i.test(m)) return '네트워크 연결을 확인해 주세요.';
    if(/invalid-api-key|api-key/i.test(m)) return 'API 키가 올바르지 않아요. 설정을 다시 붙여넣어 주세요.';
    return m;
  }

  /* ---------- 원격 → 로컬 반영(viewer) ---------- */
  function applyRemoteState(remote){
    try{
      const keepGroup = (typeof state === 'object' && state) ? state.activeGroup : null;
      const next = (typeof migrate === 'function') ? migrate(remote) : remote;
      if(keepGroup && typeof GROUPS !== 'undefined' && GROUPS.includes(keepGroup)) next.activeGroup = keepGroup;
      state = next;
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
      if(typeof renderAll === 'function') renderAll();
      if(typeof selectedDate !== 'undefined' && selectedDate && document.getElementById('daySheet') && !document.getElementById('daySheet').hidden){
        if(typeof openDaySheet === 'function') openDaySheet(selectedDate);
      }
    }catch(e){ console.warn('원격 상태 반영 실패', e); }
  }

  /* ---------- 로컬 → 원격 업로드(owner) ---------- */
  async function pushNow(){
    if(!docRef || !cfg || cfg.role === 'viewer' || !fb) return;
    const snapshot = JSON.parse(JSON.stringify(state));
    const now = Date.now();
    await fb.setDoc(docRef, { state: snapshot, updatedAt: now });
    lastUpdated = now;
  }

  /* ---------- 공개 API ---------- */
  window.Sync = {
    init(){
      // 공유 링크로 열렸는지 확인 (#share=...)
      const m = location.hash.match(/[#&]share=([^&]+)/);
      if(m){
        const decoded = decodeShare(m[1]);
        if(decoded && decoded.config && decoded.code){
          cfg = { config: decoded.config, code: decoded.code, role: 'viewer' };
          saveCfg(cfg);
        }
        history.replaceState(null, '', location.pathname + location.search);
      }
      cfg = cfg || loadCfg();
      if(cfg && validConfig(cfg.config)) connect(); else setStatus('off');
    },
    onLocalSave(){
      if(!cfg || cfg.role === 'viewer' || !docRef) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(()=>{ pushNow().then(()=>setStatus('live')).catch(e=>setStatus('error', friendly(e))); }, 400);
    },
    readonly(){ return !!(cfg && cfg.role === 'viewer'); },
    isOn(){ return !!cfg; },
    role(){ return cfg ? cfg.role : null; },
    code(){ return cfg ? cfg.code : null; },
    lastUpdated(){ return lastUpdated || null; },
    getStatus(){ return { status, error: lastError, code: cfg?cfg.code:null, role: cfg?cfg.role:null, updatedAt: lastUpdated || null }; },
    async enableOwner(configText){
      const config = parseConfig(configText);
      if(!validConfig(config)) throw new Error('Firebase 설정을 인식할 수 없어요. 콘솔에서 복사한 firebaseConfig 전체(apiKey·projectId 포함)를 붙여넣어 주세요.');
      const keepCode = (cfg && cfg.code) ? cfg.code : randomCode();
      if(unsub){ unsub(); unsub = null; }
      fb = null;  // 설정이 바뀌면 재초기화
      cfg = { config, code: keepCode, role: 'owner' };
      saveCfg(cfg);
      await connect();
    },
    disable(){
      if(unsub){ unsub(); unsub = null; }
      clearCfg(); cfg = null; docRef = null; fb = null; lastUpdated = 0; pushTimer && clearTimeout(pushTimer);
      setStatus('off');
    },
    shareLink(){
      if(!cfg || !validConfig(cfg.config)) return '';
      const payload = JSON.stringify({ config: cfg.config, code: cfg.code });
      const b64 = btoa(unescape(encodeURIComponent(payload)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      return location.origin + location.pathname + '#share=' + b64;
    },
  };

  function decodeShare(token){
    try{
      let s = token.replace(/-/g,'+').replace(/_/g,'/');
      while(s.length % 4) s += '=';
      return JSON.parse(decodeURIComponent(escape(atob(s))));
    }catch(e){ return null; }
  }
})();
