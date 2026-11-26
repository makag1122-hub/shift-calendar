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
  let failUpdates = opts.failUpdates || 0;
  const calls = { setDoc: [], updateDoc: [], deleteDoc: [], getDoc: [], renders: 0, snapshots: [], sheetOpens: 0 };
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
    document: opts.dom || { getElementById: () => null },
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
      updateDoc: async (...args) => {
        calls.updateDoc.push(args);
        /* 신호가 끊긴 상황을 흉내 냅니다: 처음 몇 번은 실패시킵니다. */
        if(failUpdates > 0){ failUpdates--; throw new Error(opts.failCode || 'Failed to fetch'); }
      },
      deleteDoc: async (...args) => { calls.deleteDoc.push(args); },
      getDocs: async () => ({ docs: [] }),
      arrayUnion: value => ({ arrayUnion: value }),
      onSnapshot: (ref, onValue) => {
        /* 참여자 목록 구독은 모양이 달라서 빼고, 달력 문서 구독만 다시 울릴 수 있게 모아 둔다. */
        if(!String(ref).includes('/participants')) calls.snapshots.push(onValue);
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
  /* 새 방은 사람이 옮겨 적을 수 있는 8자리, 예전 방은 20자리 그대로 열려야 합니다. */
  assert(/#share=[a-z2-9]{8,20}$/.test(link), '간편 공유 링크가 공유 코드 형식이 아닙니다.');
  assert(/#share=[a-z2-9]{8}$/.test(link), '새 공유방 코드가 8자리가 아닙니다(사람이 옮겨 적기 어렵습니다).');
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

/* ---------- 메모를 쓰는 중에 입력칸을 덮어쓰지 않는지 ----------
   메모는 한 글자 칠 때마다 저장되고, 저장본은 앞뒤 공백이 지워진 값입니다.
   그 글자가 클라우드를 한 바퀴 돌아 스냅샷으로 되돌아올 때 날짜 시트를 다시 그리면
   입력칸이 저장본으로 덮어써져, 방금 친 띄어쓰기·줄바꿈이 사라지고 커서가 끝으로 튑니다. */
async function verifyTypingMemoIsNotOverwritten(){
  const remoteData = {
    state: {
      activeGroup: 'A',
      groupMemos: { A: {}, B: {}, C: {}, D: {} },
    },
    sharedMemos: { A: { '2026-08-17': '저녁 7시' } },
    updatedAt: 100,
    memoUpdatedAt: 200,
  };
  const memoBox = { value: '' };
  const daySheet = { hidden: false };
  const dom = {
    activeElement: null,
    getElementById: id => (id === 'sheetMemo' ? memoBox : (id === 'daySheet' ? daySheet : null)),
  };
  const { sandbox, calls } = makeSandbox('viewer', remoteData, { dom });
  sandbox.selectedDate = '2026-08-17';
  sandbox.openDaySheet = () => {
    calls.sheetOpens++;
    memoBox.value = (sandbox.state.groupMemos.A['2026-08-17'] || '');  // 실제 동작: 저장본으로 되돌림
  };
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  // 사용자가 "저녁 7시 " 까지 쳤다(끝에 띄어쓰기). 저장은 공백을 지운 "저녁 7시"로 나간다.
  dom.activeElement = memoBox;
  memoBox.value = '저녁 7시 ';
  const before = calls.sheetOpens;
  calls.snapshots.forEach(fire => fire({ data: () => remoteData }));

  assert(
    memoBox.value === '저녁 7시 ',
    '메모를 쓰는 중에 입력칸이 저장본으로 덮어써져 방금 친 띄어쓰기가 사라졌습니다.'
  );
  assert(
    calls.sheetOpens === before,
    '메모 입력칸에 커서가 있는데도 날짜 시트를 다시 그렸습니다(커서가 끝으로 튑니다).'
  );

  // 입력칸에서 손을 뗀 뒤에는 상대가 바꾼 메모가 정상적으로 반영돼야 한다.
  dom.activeElement = null;
  calls.snapshots.forEach(fire => fire({ data: () => remoteData }));
  assert(
    calls.sheetOpens > before,
    '메모 입력이 끝난 뒤에도 공유된 변경이 날짜 시트에 반영되지 않습니다.'
  );
}

/* ---------- 메모 업로드가 실패했을 때 ----------
   지하철에서 신호가 끊긴 사이 쓴 메모가, 신호가 돌아와도 영영 안 올라가면 안 됩니다.
   본인 화면에는 저장돼 있으니 멀쩡해 보이는 게 함정입니다. */
async function verifyMemoUploadRetries(){
  const { sandbox, calls } = makeSandbox('owner', null, { failUpdates: 1 });
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  sandbox.Sync.saveMemo('A', '2026-08-17', '퇴근 후 약속');
  await wait(520);
  assert(calls.updateDoc.length === 1, '메모 업로드가 한 번은 시도돼야 합니다.');
  assert(sandbox.Sync.getStatus().status === 'error', '업로드 실패가 사용자에게 알려지지 않았습니다.');

  await wait(2600);   // 사용자가 더 타이핑하지 않아도 스스로 다시 시도해야 합니다
  assert(
    calls.updateDoc.length === 2,
    '메모 업로드가 실패한 뒤 스스로 다시 시도하지 않습니다 — 메모가 영영 안 올라갑니다.'
  );
  assert(
    calls.updateDoc[1][1]['sharedMemos.A.2026-08-17'] === '퇴근 후 약속',
    '다시 시도할 때 원래 메모 내용이 실려 있지 않습니다.'
  );
  assert(sandbox.Sync.getStatus().status === 'live', '다시 올린 뒤에도 오류 상태로 남아 있습니다.');

  await wait(2600);   // 성공했으면 더 두드리지 않아야 합니다
  assert(calls.updateDoc.length === 2, '올리기에 성공한 뒤에도 계속 재시도하고 있습니다.');
}

/* 공유방에서 쫓겨났거나 규칙이 막은 경우(permission-denied)는 다시 시도해도 소용없습니다. */
async function verifyMemoUploadGivesUpOnPermissionDenied(){
  const { sandbox, calls } = makeSandbox('owner', null, { failUpdates: 99, failCode: 'permission-denied' });
  vm.runInNewContext(source, sandbox);
  sandbox.Sync.init();
  await wait(20);

  sandbox.Sync.saveMemo('A', '2026-08-17', '퇴근 후 약속');
  await wait(520);
  assert(calls.updateDoc.length === 1, '메모 업로드가 한 번은 시도돼야 합니다.');
  await wait(2600);
  assert(
    calls.updateDoc.length === 1,
    '권한이 막힌 상황인데도 계속 다시 시도하고 있습니다.'
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
  verifyTypingMemoIsNotOverwritten(),
  verifyMemoUploadRetries(),
  verifyMemoUploadGivesUpOnPermissionDenied(),
])
  .then(() => console.log('공동 메모 동기화 검사 통과'))
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
