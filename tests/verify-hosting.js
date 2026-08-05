'use strict';

/*
 * Firebase Hosting은 저장소 루트를 그대로 배포합니다("public": ".").
 * 웹 파일이 루트에 있어야 GitHub Pages도 같이 살아 있기 때문인데,
 * 대신 실수로 서명키·AAB·테스트 산출물이 공개될 수 있습니다.
 * 그래서 루트의 모든 항목이 "웹에 올라가야 할 것"이거나 "ignore에 잡힌 것"
 * 둘 중 하나임을 확인합니다. 새 폴더를 만들면 여기서 먼저 걸립니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
const projects = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8')).projects;

assert(hosting, 'firebase.json에 hosting 설정이 없습니다.');
assert(hosting.public === '.', 'hosting.public이 저장소 루트가 아닙니다.');
assert(
  projects.default === 'gyodae-calendar',
  `Hosting 프로젝트가 공유에 쓰는 Firestore 프로젝트와 다릅니다: ${projects.default}`
);

/* 웹에 반드시 올라가야 하는 것 */
const PUBLISHED = [
  'index.html',
  'privacy.html',
  'app.js',
  'sync.js',
  'sync-config.js',
  'qrcode.js',
  'style.css',
  'service-worker.js',
  'manifest.json',
  'widget-version.json',
  'icons',
  '.well-known',
  '.nojekyll',
];

/* 절대 올라가면 안 되는 것 — ignore 규칙이 반드시 잡아야 합니다. */
const MUST_IGNORE = [
  '.git',
  '.github',
  '.gitignore',
  '.claude',
  '.playwright-cli',
  '.firebase',
  'android-widget',
  'tests',
  'output',
  'firestore.rules',
  'firebase.json',
  '.firebaserc',
  'README.md',
];

/** firebase.json의 ignore 글롭을 최상위 항목 이름에 대해 흉내 냅니다. */
function ignored(name){
  return hosting.ignore.some(pattern => {
    const head = pattern.split('/')[0];
    if(head === '**') return false;           // **/node_modules 같은 하위 전용 규칙
    const regex = new RegExp('^' + head.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return regex.test(name);
  });
}

for(const name of MUST_IGNORE){
  assert(ignored(name), `배포하면 안 되는 "${name}"이 firebase.json ignore에 없습니다.`);
}

for(const name of PUBLISHED){
  assert(fs.existsSync(path.join(ROOT, name)), `웹에 필요한 "${name}"이 없습니다.`);
  assert(!ignored(name), `웹에 필요한 "${name}"이 firebase.json ignore에 잡혀 배포되지 않습니다.`);
}

/* 루트에 새로 생긴 항목은 둘 중 하나로 분류돼 있어야 합니다. */
const known = new Set([...PUBLISHED, ...MUST_IGNORE]);
const unclassified = fs.readdirSync(ROOT).filter(name => !known.has(name) && !ignored(name));
assert(
  unclassified.length === 0,
  `루트의 "${unclassified.join('", "')}" 이(가) 배포 대상인지 정해지지 않았습니다. `
    + 'firebase.json의 ignore에 넣거나 이 테스트의 PUBLISHED에 추가해 주세요.'
);

/* 서명키·앱 번들이 배포 목록에 섞이지 않았는지 직접 확인합니다. */
const SECRET_EXTENSIONS = ['.jks', '.p12', '.keystore', '.aab', '.apk'];
function walkPublished(dir, relative){
  for(const entry of fs.readdirSync(dir, { withFileTypes:true })){
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if(!relative && ignored(entry.name)) continue;
    if(entry.isDirectory()){
      walkPublished(path.join(dir, entry.name), rel);
      continue;
    }
    assert(
      !SECRET_EXTENSIONS.some(extension => entry.name.toLowerCase().endsWith(extension)),
      `배포 대상에 서명키·설치파일이 있습니다: ${rel}`
    );
  }
}
walkPublished(ROOT, '');

/* App Links 소유 증명 파일 */
const assetLinksPath = path.join(ROOT, '.well-known', 'assetlinks.json');
assert(fs.existsSync(assetLinksPath), '.well-known/assetlinks.json이 없습니다.');
const assetLinks = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
assert(
  assetLinks[0].target.package_name === 'kr.co.shiftcalendar.widget',
  'assetlinks.json의 패키지 이름이 앱과 다릅니다.'
);
assert(
  hosting.headers.some(rule =>
    rule.source === '/.well-known/assetlinks.json'
      && rule.headers.some(h => h.key === 'Content-Type' && h.value === 'application/json')
  ),
  'assetlinks.json을 application/json으로 내려주는 헤더가 없습니다.'
);

/* 셸이 캐시에 묶이면 배포해도 폰에 안 내려갑니다. */
for(const source of ['/service-worker.js', '/index.html']){
  assert(
    hosting.headers.some(rule =>
      rule.source === source && rule.headers.some(h => h.key === 'Cache-Control')
    ),
    `${source}의 캐시 헤더가 없습니다.`
  );
}

/*
 * 형식이 어긋난 값이 하나라도 섞이면 Google 검증기가 이 파일을 통째로 거부합니다.
 * 그래서 자리표시자를 남겨 두느니 아직 모르는 지문은 빼 두는 편이 낫습니다.
 */
const REQUIRED_FINGERPRINTS = {
  /* Play가 AAB를 다시 서명하는 키. 스토어에서 설치한 사용자가 이걸 씁니다. */
  'Play 앱 서명 키':
    '7C:DF:56:22:AD:AE:D4:A4:BC:B2:A2:65:EE:3A:D2:9F:1D:B1:8D:14:06:61:CC:1E:7D:EA:19:C0:BA:E7:A5:F3',
  /* CI가 APK·AAB에 서명하는 키. GitHub 릴리스로 직접 받은 APK가 이걸 씁니다. */
  '업로드·직접배포 키':
    '55:82:03:91:B2:E6:D1:02:A2:71:0B:AE:0F:6E:D8:2A:73:34:99:68:3C:06:48:5D:0B:8A:46:38:B5:07:B6:22',
};
const fingerprints = assetLinks[0].target.sha256_cert_fingerprints;

assert(Array.isArray(fingerprints) && fingerprints.length >= 1, 'assetlinks.json에 인증서 지문이 없습니다.');
for(const value of fingerprints){
  assert(
    /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value),
    `assetlinks.json의 지문 형식이 잘못됐습니다(대문자 16진수 32바이트, 콜론 구분): ${value}`
  );
}
for(const [label, value] of Object.entries(REQUIRED_FINGERPRINTS)){
  assert(
    fingerprints.includes(value),
    `${label} 지문이 빠졌습니다. 해당 경로로 설치한 사용자는 초대 링크가 앱으로 열리지 않습니다.`
  );
}

console.log(`Hosting 배포 설정 검사 통과 (지문 ${fingerprints.length}개 등록됨)`);
