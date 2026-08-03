'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8')
  .replace('const appMod = await import(SDK_APP);', 'const appMod = globalThis.__appMod;')
  .replace('const fsMod  = await import(SDK_FS);', 'const fsMod  = globalThis.__fsMod;')
  .replace('const authMod = await import(SDK_AUTH);', 'const authMod = globalThis.__authMod;');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function wait(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeSandbox(role, remoteData, options){
  const opts = options || {};
  const calls = { setDoc: [], updateDoc: [], deleteDoc: [], getDoc: [], renders: 0 };
  const cfg = {
    config: { apiKey: 'test-key', projectId: 'test-project' },
    code: opts.code || 'shared-calendar',
    role,
  };
  if(opts.managed){
    cfg.managed = true;
    cfg.secured = true;
  }
  /* 클라우드 문서의 ownerUid가 이 기기의 익명 uid와 같으면 진짜 주인입니다. */
  const remoteDoc = Object.prototype.hasOwnProperty.call(opts, 'remoteDoc')
    ? opts.remoteDoc
    : { ownerUid: 'someone-else' };
  const storage = new Map(role ? [['shiftcal.sync', JSON.stringify(cfg)]] : []);
  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Promise,
    crypto: {
      getRandomValues: array => {
        for(let i = 0; i < array.length; i++) array[i] = i + 1;
        return array;
      },
    },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    location: {
      hash: opts.hash || '',
      pathname: '/',
      search: '',
      origin: 'https://example.test',
    },
    history: { replaceState: () => {} },
    document: { getElementById: () => null },
    window: {},
    state: {
      activeGroup: 'A',
      groupMemos: { A: { '2026-07-12': '기존 메모' }, B: {}, C: {}, D: {} },
    },
    STORAGE_KEY: 'shiftcal.state',
    GROUPS: ['A', 'B', 'C', 'D'],
    migrate: value => JSON.parse(JSON.stringify(value)),
    renderAll: () => { calls.renders++; },
    __appMod: {
      getApps: () => [],
      initializeApp: config => ({ config }),
    },
    __fsMod: {
      getFirestore: app => ({ app }),
      doc: (_db, ...parts) => parts.join('/'),
      getDoc: async ref => {
        calls.getDoc.push(ref);
        return { exists: () => !!remoteDoc, data: () => remoteDoc };
      },
      collection: (_db, ...parts) => parts.join('/'),
      setDoc: async (...args) => { calls.setDoc.push(args); },
      updateDoc: async (...args) => { calls.updateDoc.push(args); },
      deleteDoc: async (...args) => { calls.deleteDoc.push(args); },
      getDocs: async () => ({ docs: [] }),
      arrayUnion: value => ({ arrayUnion: value }),
      onSnapshot: (_ref, onValue) => {
        if(remoteData) onValue({ data: () => remoteData });
        return () => {};
      },
    },
    __authMod: {
      getAuth: app => ({ app, currentUser: null, authStateReady: async () => {} }),
      signInAnonymously: async () => ({ user: { uid: 'anonymous-test-user' } }),
    },
  };
  sandbox.window = sandbox;
  return { sandbox, calls };
}

async function verifyParticipantName(){
  const { sandbox, calls } = makeSandbox(null);
  sandbox.SHIFT_CALENDAR_FIREBASE_CONFIG = {
    apiKey: 'managed-key',
    projectId: 'managed-project',
  };
  vm.runInNewContext(source, sandbox);
  await sandbox.Sync.enableOwner();
  await sandbox.Sync.setProfile('  광희  ');

  const write = calls.setDoc.find(call => String(call[0]).includes('/participants/'));
  assert(write, '공유방 참여자 이름 문서가 저장되지 않았습니다.');
  assert(write[1].name === '광희', '카카오 닉네임이 정리되어 저장되지 않았습니다.');
  assert(write[1].role === 'owner', '공유방 소유자 역할이 이름 문서에 없습니다.');

  await sandbox.Sync.clearProfile();
  assert(
    calls.deleteDoc.some(call => String(call[0]).includes('/participants/')),
    '카카오 연결 해제 시 공유방 이름 문서가 삭제되지 않았습니다.'
  );
}

async function verifyManagedSetup(){
  const { sandbox, calls } = makeSandbox(null);
  sandbox.SHIFT_CALENDAR_FIREBASE_CONFIG = {
    apiKey: 'managed-key',
    projectId: 'managed-project',
  };
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();

  assert(sandbox.Sync.managedReady(), '앱 공용 Firebase 설정을 인식하지 못했습니다.');
  await sandbox.Sync.enableOwner();
  assert(calls.setDoc.length === 1, '간편 공유방 생성 시 최초 업로드가 실행되지 않았습니다.');
  assert(
    calls.setDoc[0][1].ownerUid === 'anonymous-test-user',
    '간편 공유방에 익명 인증 소유자가 기록되지 않았습니다.'
  );
  sandbox.Sync.onLocalSave();
  await wait(450);
  assert(calls.setDoc.length === 2, '공유방 생성 후 근무표 갱신이 실행되지 않았습니다.');
  assert(
    !Object.prototype.hasOwnProperty.call(calls.setDoc[1][1], 'memberUids'),
    '근무표 갱신이 이미 초대한 친구 목록을 덮어쓰려고 합니다.'
  );
  const link = sandbox.Sync.shareLink();
  assert(/#share=[a-z2-9]{20}$/.test(link), '간편 공유 링크가 짧은 공유 코드 형식이 아닙니다.');
  assert(!link.includes('managed-key'), '간편 공유 링크에 Firebase 설정이 포함됐습니다.');
}

async function verifyOwner(){
  const { sandbox, calls } = makeSandbox('owner');
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  assert(calls.setDoc.length === 1, '소유자 최초 근무표 업로드가 실행되지 않았습니다.');
  assert(
    JSON.stringify(calls.setDoc[0][2]) === JSON.stringify({ mergeFields: ['state', 'updatedAt'] }),
    '근무표 전체 교체와 공동 메모 보존 옵션이 다릅니다.'
  );

  sandbox.Sync.saveMemo('A', '2026-08-17', '퇴근 후 약속');
  await wait(520);
  assert(calls.updateDoc.length === 1, '소유자 공동 메모 저장이 실행되지 않았습니다.');
  const update = calls.updateDoc[0][1];
  assert(update['sharedMemos.A.2026-08-17'] === '퇴근 후 약속', '소유자 메모 필드 경로가 다릅니다.');
  assert(!Object.prototype.hasOwnProperty.call(update, 'state'), '메모 저장이 근무표 전체를 덮어쓰려고 합니다.');
}

async function verifyViewer(){
  const remoteData = {
    state: {
      activeGroup: 'B',
      groupMemos: { A: { '2026-07-12': '기존 메모' }, B: {}, C: {}, D: {} },
    },
    sharedMemos: {
      A: {
        '2026-07-12': '',
        '2026-08-17': '친구가 남긴 메모',
      },
    },
    updatedAt: 100,
    memoUpdatedAt: 200,
  };
  const { sandbox, calls } = makeSandbox('viewer', remoteData);
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  assert(sandbox.Sync.canWriteMemo(), '공유 상대의 메모 작성 권한이 활성화되지 않았습니다.');
  assert(sandbox.state.activeGroup === 'A', '공유 화면에서 사용자가 보고 있던 조가 유지되지 않았습니다.');
  assert(!sandbox.state.groupMemos.A['2026-07-12'], '원격에서 삭제한 메모가 로컬에 남았습니다.');
  assert(
    sandbox.state.groupMemos.A['2026-08-17'] === '친구가 남긴 메모',
    '원격 공동 메모가 공유 화면에 병합되지 않았습니다.'
  );
  assert(sandbox.Sync.lastUpdated() === 200, '공동 메모의 최신 갱신 시각이 반영되지 않았습니다.');

  sandbox.Sync.saveMemo('A', '2026-08-17', '저녁 7시');
  await wait(520);
  assert(calls.updateDoc.length === 1, '공유 상대의 메모 저장이 실행되지 않았습니다.');
  assert(
    calls.updateDoc[0][1]['sharedMemos.A.2026-08-17'] === '저녁 7시',
    '공유 상대의 메모 값이 날짜별 필드로 저장되지 않았습니다.'
  );
}

/* ---------- 내 초대 링크를 내가 눌렀을 때 ----------
   방을 만든 사람이 카톡에 보낸 링크를 확인차 한 번 눌렀다는 이유로
   보기 전용이 되면, 다음에 앱을 열었을 때 초대 링크와 공유 버튼이 사라집니다. */
const OWN_CODE = 'abcdefghijkmnpqrstuv';

async function verifyOwnerKeepsRoleOnOwnLink(){
  const { sandbox } = makeSandbox('owner', null, {
    code: OWN_CODE,
    managed: true,
    hash: '#share=' + OWN_CODE,
  });
  sandbox.SHIFT_CALENDAR_FIREBASE_CONFIG = {
    apiKey: 'managed-key',
    projectId: 'managed-project',
  };
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  assert(
    sandbox.Sync.role() === 'owner',
    '내가 만든 초대 링크를 내가 열었더니 보기 전용으로 바뀌었습니다.'
  );
  assert(
    sandbox.Sync.shareLink().includes('#share=' + OWN_CODE),
    '내 초대 링크를 연 뒤 공유 링크가 사라졌습니다.'
  );
  const stored = JSON.parse(sandbox.localStorage.getItem('shiftcal.sync'));
  assert(
    stored && stored.role === 'owner',
    '보기 전용 역할이 이 기기에 저장되어 다음 실행에도 남습니다.'
  );
}

async function verifyDemotedOwnerRestored(){
  const { sandbox } = makeSandbox('viewer', null, {
    code: OWN_CODE,
    managed: true,
    remoteDoc: { ownerUid: 'anonymous-test-user' },
  });
  sandbox.SHIFT_CALENDAR_FIREBASE_CONFIG = {
    apiKey: 'managed-key',
    projectId: 'managed-project',
  };
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  assert(
    sandbox.Sync.role() === 'owner',
    '이미 보기 전용으로 바뀐 기기가 클라우드의 ownerUid로 복구되지 않았습니다.'
  );
  const stored = JSON.parse(sandbox.localStorage.getItem('shiftcal.sync'));
  assert(stored && stored.role === 'owner', '복구된 소유자 역할이 저장되지 않았습니다.');
}

async function verifyRealViewerStaysViewer(){
  const { sandbox } = makeSandbox('viewer', null, {
    code: OWN_CODE,
    managed: true,
    remoteDoc: { ownerUid: 'someone-else' },
  });
  sandbox.SHIFT_CALENDAR_FIREBASE_CONFIG = {
    apiKey: 'managed-key',
    projectId: 'managed-project',
  };
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  assert(
    sandbox.Sync.role() === 'viewer',
    '초대받은 친구가 방 주인으로 승격됐습니다.'
  );
}

Promise.all([
  verifyOwner(),
  verifyViewer(),
  verifyManagedSetup(),
  verifyParticipantName(),
  verifyOwnerKeepsRoleOnOwnLink(),
  verifyDemotedOwnerRestored(),
  verifyRealViewerStaysViewer(),
])
  .then(() => console.log('공동 메모 동기화 검사 통과'))
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
