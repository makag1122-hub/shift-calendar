'use strict';

/* ============================================================
   실시간 공유 (친구는 근무표 보기 + 메모 작성)
   - 소유자(owner)가 저장할 때마다 클라우드에 자동 push
   - 보기(viewer)는 근무표를 구독하고 메모만 공동 작성
   - 저장소: 앱 운영자가 한 번 설정한 Firebase Firestore
   - 사용자는 공유방을 만들고 친구에게 링크만 보내면 됨
   app.js 보다 먼저 로드되며, 실제 동작은 app.js 로드 후 Sync.init()에서 시작됩니다.
   ============================================================ */
(function(){
  const SYNC_KEY = 'shiftcal.sync';   // localStorage: { config, code, role }
  const PROFILE_KEY = 'shiftcal.profile'; // localStorage: 공유방에 표시할 내 이름
  const SDK_APP = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  const SDK_FS  = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
  const SDK_AUTH = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

  let cfg = null;        // { config:{...}, code:'xxxx', role:'owner'|'viewer' }
  let fb = null;         // { db, doc, setDoc, updateDoc, onSnapshot }
  let docRef = null;
  let unsub = null;
  let participantsUnsub = null;
  let pushTimer = null;
  let memoPushTimer = null;
  let pendingMemoUpdates = {};
  let status = 'off';    // off | connecting | live | readonly | error
  let lastError = '';
  let lastUpdated = 0;   // 마지막으로 클라우드에 반영된 시각(ms) — viewer는 원격, owner는 내 push
  // 이름은 카카오 로그인 대신 사용자가 직접 입력하고, 이 기기에 저장해 둡니다.
  let profileName = loadProfileName();
  let profileResolved = !!profileName;
  let participantError = '';
  let participantList = [];
  // 방장이 누구인지는 클라우드 문서가 정합니다. 참여자 목록에서 방장을 표시할 때 씁니다.
  let remoteOwnerUid = '';
  // 방장이 내보내면 읽기 권한이 사라집니다. 그냥 '오류'로 두면 원인을 알 수 없어 따로 표시합니다.
  let removedFromRoom = false;

  /* ---------- 저장/불러오기 ---------- */
  function loadCfg(){ try{ return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); }catch(e){ return null; } }
  function saveCfg(c){ try{ localStorage.setItem(SYNC_KEY, JSON.stringify(c)); }catch(e){} }
  function clearCfg(){ try{ localStorage.removeItem(SYNC_KEY); }catch(e){} }
  function loadProfileName(){
    try{ return cleanProfileName(localStorage.getItem(PROFILE_KEY) || ''); }catch(e){ return ''; }
  }
  function saveProfileName(name){
    try{
      if(name) localStorage.setItem(PROFILE_KEY, name);
      else localStorage.removeItem(PROFILE_KEY);
    }catch(e){}
  }

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
  function managedConfig(){
    const value = window.SHIFT_CALENDAR_FIREBASE_CONFIG;
    return validConfig(value) ? value : null;
  }

  function randomCode(){
    const s = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    const arr = crypto.getRandomValues(new Uint8Array(20));
    for(const n of arr) out += s[n % s.length];
    return out;
  }

  function setStatus(s, err){
    status = s; lastError = err || '';
    if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
  }

  /* ---------- Firebase 로드/초기화 ---------- */
  async function ensureFirebase(config, useManagedAuth){
    if(fb) return fb;
    const appMod = await import(SDK_APP);
    const fsMod  = await import(SDK_FS);
    // 설정을 다시 넣는 경우 기존 앱을 지우고 재초기화(중복 앱 오류 방지)
    const apps = appMod.getApps ? appMod.getApps() : [];
    if(apps.length && appMod.deleteApp){ try{ await appMod.deleteApp(apps[0]); }catch(e){} }
    const app = appMod.initializeApp(config);
    const db  = fsMod.getFirestore(app);
    let uid = null;
    if(useManagedAuth){
      const authMod = await import(SDK_AUTH);
      const auth = authMod.getAuth(app);
      if(typeof auth.authStateReady === 'function') await auth.authStateReady();
      const user = auth.currentUser || (await authMod.signInAnonymously(auth)).user;
      uid = user ? user.uid : null;
      if(!uid) throw new Error('공유용 익명 인증에 실패했습니다.');
    }
    fb = {
      db,
      uid,
      doc: fsMod.doc,
      getDoc: fsMod.getDoc,
      setDoc: fsMod.setDoc,
      updateDoc: fsMod.updateDoc,
      deleteDoc: fsMod.deleteDoc,
      onSnapshot: fsMod.onSnapshot,
      arrayUnion: fsMod.arrayUnion,
      collection: fsMod.collection,
      getDocs: fsMod.getDocs,
    };
    return fb;
  }

  async function connect(){
    if(!cfg || !validConfig(cfg.config)){ setStatus('off'); return; }
    removedFromRoom = false;
    setStatus('connecting');
    try{
      const f = await ensureFirebase(cfg.config, !!(cfg.managed || cfg.secured));
      docRef = f.doc(f.db, 'calendars', cfg.code);
      await restoreOwnership(f);
      if(cfg.role === 'viewer'){
        if(f.uid && f.arrayUnion){
          await f.updateDoc(docRef, { memberUids: f.arrayUnion(f.uid) });
        }
        unsub = f.onSnapshot(docRef,
          (snap)=>{
            const d = snap.data();
            if(d){
              if(d.ownerUid) remoteOwnerUid = d.ownerUid;
              if(d.state) applyRemoteState(d.state, d.sharedMemos);
              lastUpdated = Math.max(Number(d.updatedAt)||0, Number(d.memoUpdatedAt)||0);
            }
            setStatus('readonly');
          },
          (err)=>{ handleViewerError(err); });
        subscribeParticipants();
        await syncParticipantProfile();
      }else{
        await pushNow();          // 최초 1회 현재 상태 업로드(문서 생성)
        unsub = f.onSnapshot(docRef,
          (snap)=>{
            const d = snap.data();
            if(d){
              if(d.ownerUid) remoteOwnerUid = d.ownerUid;
              if(d.sharedMemos) applyRemoteMemos(d.sharedMemos);
              lastUpdated = Math.max(Number(d.updatedAt)||0, Number(d.memoUpdatedAt)||0);
            }
            setStatus('live');
          },
          (err)=>{ setStatus('error', friendly(err)); });
        subscribeParticipants();
        await syncParticipantProfile();
        setStatus('live');
      }
    }catch(e){ setStatus('error', friendly(e)); }
  }

  /*
   * 내가 만든 공유방인데 초대 링크를 눌러 보기 전용으로 바뀐 기기를 되돌립니다.
   * 진짜 주인은 이 기기에 저장된 역할이 아니라 클라우드의 ownerUid가 정합니다.
   * (익명 로그인 uid는 이 기기에 계속 남아 있으므로 재설치 전까지 그대로입니다.)
   */
  async function restoreOwnership(f){
    if(!cfg || cfg.role === 'owner' || !f || !f.uid || !f.getDoc || !docRef) return;
    try{
      const snap = await f.getDoc(docRef);
      const data = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
      if(data && data.ownerUid && data.ownerUid === f.uid){
        cfg = Object.assign({}, cfg, { role: 'owner' });
        saveCfg(cfg);
      }
    }catch(e){
      /* 진짜 보기 전용 참여자는 아직 멤버가 아니라 읽기가 막힙니다. 그대로 진행합니다. */
    }
  }

  function friendly(e){
    const m = (e && (e.code || e.message)) ? (e.code || e.message) : String(e);
    if(/permission-denied/i.test(m)) return '권한 거부됨 — Firestore 보안 규칙을 확인해 주세요.';
    if(/failed to fetch|network|offline/i.test(m)) return '네트워크 연결을 확인해 주세요.';
    if(/invalid-api-key|api-key/i.test(m)) return 'API 키가 올바르지 않아요. 설정을 다시 붙여넣어 주세요.';
    return m;
  }

  function cleanProfileName(value){
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 20);
  }

  function participantDoc(){
    if(!fb || !fb.uid || !cfg || !docRef) return null;
    return fb.doc(fb.db, 'calendars', cfg.code, 'participants', fb.uid);
  }

  /*
   * 참여자 목록은 앱뿐 아니라 브라우저에서도 보여 줍니다.
   * 초대받은 사람이 "방장이 누구고 누가 들어와 있는지"를 확인할 곳이 여기뿐입니다.
   */
  function subscribeParticipants(){
    if(participantsUnsub){ participantsUnsub(); participantsUnsub = null; }
    participantList = [];
    if(!fb || !fb.collection || !cfg || !docRef) return;
    const ref = fb.collection(fb.db, 'calendars', cfg.code, 'participants');
    participantsUnsub = fb.onSnapshot(ref,
      (snap)=>{
        participantError = '';
        participantList = (snap.docs || []).map(item=>{
          const value = item.data ? item.data() : {};
          return {
            uid: item.id,                       // 내보내기에 필요합니다
            name: cleanProfileName(value && value.name),
            role: value && value.role === 'owner' ? 'owner' : 'viewer',
            joinedAt: Number(value && value.joinedAt) || 0,
          };
        }).filter(item=>item.name).sort((a,b)=>{
          if(a.role !== b.role) return a.role === 'owner' ? -1 : 1;
          return a.joinedAt - b.joinedAt;
        }).slice(0, 10);
        if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
      },
      (err)=>{
        participantError = friendly(err);
        if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
      });
  }

  /*
   * 방장이 내보내면 문서를 더 읽을 수 없어 permission-denied가 옵니다.
   * 설정이 잘못됐을 때와 메시지가 같으면 원인을 알 수 없으므로 구분해 줍니다.
   */
  function handleViewerError(err){
    const message = (err && (err.code || err.message)) ? String(err.code || err.message) : '';
    if(/permission-denied/i.test(message) && lastUpdated){
      removedFromRoom = true;
      if(unsub){ unsub(); unsub = null; }
      if(participantsUnsub){ participantsUnsub(); participantsUnsub = null; }
      participantList = [];
      setStatus('removed');
      return;
    }
    setStatus('error', friendly(err));
  }

  /* 방장만 씁니다. 참여자 문서를 지우고 멤버 목록에서도 빼야 실제로 접근이 끊깁니다. */
  async function removeMember(uid){
    if(!cfg || cfg.role !== 'owner' || !fb || !docRef) throw new Error('방장만 내보낼 수 있어요.');
    if(!uid || uid === fb.uid) throw new Error('자기 자신은 내보낼 수 없어요.');
    const snap = await fb.getDoc(docRef);
    const data = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
    const members = (data && Array.isArray(data.memberUids)) ? data.memberUids : [];
    await fb.updateDoc(docRef, { memberUids: members.filter(item=>item !== uid) });
    try{
      await fb.deleteDoc(fb.doc(fb.db, 'calendars', cfg.code, 'participants', uid));
    }catch(e){
      /* 멤버 목록에서 빠지면 이미 접근은 끊깁니다. 남은 이름표는 다음 정리 때 사라집니다. */
    }
  }

  async function upsertParticipant(){
    const ref = participantDoc();
    if(!ref || !profileName || !cfg) return;
    const now = Date.now();
    try{
      await fb.setDoc(ref, {
        name: profileName,
        role: cfg.role === 'owner' ? 'owner' : 'viewer',
        joinedAt: now,
        updatedAt: now,
      }, { merge:true });
      participantError = '';
    }catch(e){
      participantError = friendly(e);
      if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
    }
  }

  async function removeParticipant(silent){
    const ref = participantDoc();
    if(!ref || !fb || !fb.deleteDoc) return;
    try{
      await fb.deleteDoc(ref);
      participantError = '';
    }catch(e){
      if(!silent){
        participantError = friendly(e);
        if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
      }
    }
  }

  async function syncParticipantProfile(){
    if(!profileResolved) return;
    if(profileName) await upsertParticipant();
    else await removeParticipant();
  }

  /* ---------- 원격 → 로컬 반영(viewer) ---------- */
  function mergeRemoteMemos(target, remoteMemos){
    if(!remoteMemos || typeof remoteMemos !== 'object') return target;
    if(!target.groupMemos || typeof target.groupMemos !== 'object') target.groupMemos = {};
    for(const group of ['A','B','C','D']){
      if(!target.groupMemos[group] || typeof target.groupMemos[group] !== 'object') target.groupMemos[group] = {};
      const incoming = remoteMemos[group];
      if(!incoming || typeof incoming !== 'object') continue;
      for(const date in incoming){
        const value = String(incoming[date] || '').trim();
        if(value) target.groupMemos[group][date] = value;
        else delete target.groupMemos[group][date]; // 빈 문자열은 공동 메모 삭제 표시
      }
    }
    return target;
  }

  function persistRemoteState(next){
    state = next;
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
    if(typeof renderAll === 'function') renderAll();
    if(typeof selectedDate !== 'undefined' && selectedDate && document.getElementById('daySheet') && !document.getElementById('daySheet').hidden){
      if(typeof openDaySheet === 'function') openDaySheet(selectedDate);
    }
  }

  function applyRemoteState(remote, remoteMemos){
    try{
      const keepGroup = (typeof state === 'object' && state) ? state.activeGroup : null;
      const next = (typeof migrate === 'function') ? migrate(remote) : remote;
      if(keepGroup && typeof GROUPS !== 'undefined' && GROUPS.includes(keepGroup)) next.activeGroup = keepGroup;
      persistRemoteState(mergeRemoteMemos(next, remoteMemos));
    }catch(e){ console.warn('원격 상태 반영 실패', e); }
  }

  function applyRemoteMemos(remoteMemos){
    try{
      if(typeof state !== 'object' || !state) return;
      persistRemoteState(mergeRemoteMemos(state, remoteMemos));
    }catch(e){ console.warn('공동 메모 반영 실패', e); }
  }

  /* ---------- 로컬 → 원격 업로드(owner) ---------- */
  async function pushNow(){
    if(!docRef || !cfg || cfg.role === 'viewer' || !fb) return;
    const snapshot = JSON.parse(JSON.stringify(state));
    const now = Date.now();
    // state는 통째로 교체해 삭제된 일정도 반영하되, 공동 메모 필드는 보존합니다.
    const data = { state: snapshot, updatedAt: now };
    const mergeFields = ['state', 'updatedAt'];
    const initializeOwnership = !!(fb.uid && !cfg.initialized);
    if(initializeOwnership){
      data.ownerUid = fb.uid;
      data.memberUids = [fb.uid];
      mergeFields.push('ownerUid', 'memberUids');
    }
    await fb.setDoc(docRef, data, { mergeFields });
    if(initializeOwnership){
      cfg.initialized = true;
      saveCfg(cfg);
    }
    lastUpdated = now;
  }

  async function flushMemoUpdates(){
    if(!docRef || !cfg || !fb || !Object.keys(pendingMemoUpdates).length) return;
    const updates = pendingMemoUpdates;
    pendingMemoUpdates = {};
    const now = Date.now();
    updates.memoUpdatedAt = now;
    try{
      await fb.updateDoc(docRef, updates);
      lastUpdated = now;
      setStatus(cfg.role === 'viewer' ? 'readonly' : 'live');
    }catch(e){
      pendingMemoUpdates = { ...updates, ...pendingMemoUpdates };
      delete pendingMemoUpdates.memoUpdatedAt;
      setStatus('error', friendly(e));
    }
  }

  function queueMemo(group, date, value){
    if(!docRef || !cfg || !fb || !['A','B','C','D'].includes(group) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    pendingMemoUpdates[`sharedMemos.${group}.${date}`] = String(value || '').trim();
    clearTimeout(memoPushTimer);
    memoPushTimer = setTimeout(flushMemoUpdates, 450);
  }

  /* ---------- 공개 API ---------- */
  window.Sync = {
    init(){
      // 공유 링크로 열렸는지 확인 (#share=...)
      const saved = loadCfg();
      const m = location.hash.match(/[#&]share=([^&]+)/);
      if(m){
        const decoded = decodeShare(m[1]);
        const linkConfig = decoded && validConfig(decoded.config)
          ? decoded.config
          : managedConfig();
        /*
         * 내가 보낸 초대 링크를 내가 다시 눌러도 방을 만든 사람 자격을 잃으면 안 됩니다.
         * 이걸 막지 않으면 링크를 한 번 확인하는 것만으로 보기 전용이 되어
         * 다음에 앱을 열었을 때 초대 링크와 공유 버튼이 사라집니다.
         */
        const ownRoom = !!(saved && saved.role === 'owner'
          && decoded && saved.code === decoded.code);
        if(ownRoom){
          cfg = saved;
        }
        if(decoded && linkConfig && decoded.code && !ownRoom){
          cfg = {
            config: linkConfig,
            code: decoded.code,
            role: 'viewer',
            managed: !validConfig(decoded.config),
            secured: !validConfig(decoded.config) || !!decoded.secured,
          };
          saveCfg(cfg);
        }
        history.replaceState(null, '', location.pathname + location.search);
      }
      cfg = cfg || loadCfg();
      // 앱 공용 설정이 교체되면 공용 공유방도 새 설정으로 자연스럽게 이동합니다.
      if(cfg && cfg.managed && managedConfig()){
        cfg.config = managedConfig();
        saveCfg(cfg);
      }
      if(cfg && validConfig(cfg.config)) connect(); else setStatus('off');
    },
    onLocalSave(){
      if(!cfg || cfg.role === 'viewer' || !docRef) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(()=>{ pushNow().then(()=>setStatus('live')).catch(e=>setStatus('error', friendly(e))); }, 400);
    },
    readonly(){ return !!(cfg && cfg.role === 'viewer'); },
    canWriteMemo(){ return !!(cfg && cfg.role === 'viewer' && docRef && fb); },
    saveMemo(group, date, value){ queueMemo(group, date, value); },
    isOn(){ return !!cfg; },
    role(){ return cfg ? cfg.role : null; },
    code(){ return cfg ? cfg.code : null; },
    lastUpdated(){ return lastUpdated || null; },
    getStatus(){ return { status, error: lastError, participantError, removed: removedFromRoom, code: cfg?cfg.code:null, role: cfg?cfg.role:null, updatedAt: lastUpdated || null }; },
    participants(){
      return participantList.map(item=>({
        ...item,
        isMe: !!(fb && fb.uid && item.uid === fb.uid),
        isOwner: item.role === 'owner' || (!!remoteOwnerUid && item.uid === remoteOwnerUid),
      }));
    },
    /* 방장이 이름을 안 정했으면 목록에 안 뜹니다. 그때도 방장 유무는 알려 줍니다. */
    ownerNamed(){
      if(!remoteOwnerUid) return true;
      return participantList.some(item=>item.uid === remoteOwnerUid);
    },
    canRemoveMembers(){ return !!(cfg && cfg.role === 'owner' && fb && docRef); },
    async removeMember(uid){ await removeMember(uid); },
    profileName(){ return profileName; },
    async setProfile(name){
      profileName = cleanProfileName(name);
      profileResolved = true;
      participantError = '';
      saveProfileName(profileName);
      if(profileName) await upsertParticipant();
      if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
    },
    async clearProfile(){
      profileResolved = true;
      await removeParticipant(false);
      profileName = '';
      participantError = '';
      saveProfileName('');
      if(typeof window.onSyncStatus === 'function') window.onSyncStatus();
    },
    managedReady(){ return !!managedConfig(); },
    async enableOwner(configText){
      const manualText = String(configText || '').trim();
      const config = manualText ? parseConfig(manualText) : managedConfig();
      if(!validConfig(config)){
        throw new Error('앱의 공유 서버 설정이 아직 끝나지 않았어요.');
      }
      const keepCode = (cfg && cfg.code) ? cfg.code : randomCode();
      if(unsub){ unsub(); unsub = null; }
      if(participantsUnsub){ participantsUnsub(); participantsUnsub = null; }
      fb = null;  // 설정이 바뀌면 재초기화
      cfg = {
        config,
        code: keepCode,
        role: 'owner',
        managed: !manualText && !!managedConfig(),
        secured: true,
      };
      saveCfg(cfg);
      await connect();
    },
    async disable(){
      await removeParticipant(true);
      if(cfg && cfg.role === 'owner' && docRef && fb && fb.deleteDoc){
        if(fb.collection && fb.getDocs){
          try{
            const people = await fb.getDocs(fb.collection(fb.db, 'calendars', cfg.code, 'participants'));
            await Promise.all((people.docs || []).map(item=>fb.deleteDoc(item.ref)));
          }catch(e){}
        }
        try{
          await fb.deleteDoc(docRef);
        }catch(e){
          setStatus('error', friendly(e));
          throw e;
        }
      }
      if(unsub){ unsub(); unsub = null; }
      if(participantsUnsub){ participantsUnsub(); participantsUnsub = null; }
      clearCfg(); cfg = null; docRef = null; fb = null; lastUpdated = 0;
      participantList = []; participantError = '';
      remoteOwnerUid = ''; removedFromRoom = false;
      pushTimer && clearTimeout(pushTimer);
      memoPushTimer && clearTimeout(memoPushTimer);
      pendingMemoUpdates = {};
      setStatus('off');
    },
    shareLink(){
      if(!cfg || !validConfig(cfg.config)) return '';
      if(cfg.managed && managedConfig()){
        return location.origin + location.pathname + '#share=' + encodeURIComponent(cfg.code);
      }
      // 예전 사용자별 Firebase 설정으로 만든 공유방도 계속 열리도록 호환합니다.
      const payload = JSON.stringify({
        config: cfg.config,
        code: cfg.code,
        secured: !!cfg.secured,
      });
      const b64 = btoa(unescape(encodeURIComponent(payload)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      return location.origin + location.pathname + '#share=' + b64;
    },
  };

  function decodeShare(token){
    if(/^[abcdefghijkmnpqrstuvwxyz23456789]{14,32}$/.test(token)){
      return { code: token };
    }
    try{
      let s = token.replace(/-/g,'+').replace(/_/g,'/');
      while(s.length % 4) s += '=';
      return JSON.parse(decodeURIComponent(escape(atob(s))));
    }catch(e){ return null; }
  }
})();
