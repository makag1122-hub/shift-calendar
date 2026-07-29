'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function match(source, pattern, label){
  const result = source.match(pattern);
  assert(result, `${label} 버전을 찾지 못했습니다.`);
  return result[1];
}

const styleVersion = match(index, /style\.css\?v=(\w+)/, 'CSS');
const appVersion = match(index, /app\.js\?v=(\w+)/, '앱');
const workerUrlVersion = match(index, /service-worker\.js\?v=(\w+)/, '서비스워커 URL');
const workerAssetVersion = match(worker, /const ASSET_VERSION = '(\w+)'/, '서비스워커 자산');

assert(styleVersion === appVersion, 'CSS와 앱 버전이 다릅니다.');
assert(appVersion === workerUrlVersion, '앱과 서비스워커 URL 버전이 다릅니다.');
assert(workerUrlVersion === workerAssetVersion, '서비스워커 URL과 캐시 자산 버전이 다릅니다.');
assert(index.includes("updateViaCache:'none'"), '서비스워커 갱신이 HTTP 캐시를 우회하지 않습니다.');
assert(worker.includes("new Request(url, { cache:'reload' })"), '앱 셸 설치가 HTTP 캐시를 우회하지 않습니다.');
assert(worker.includes("fetch(request, { cache:'no-store' })"), '화면 이동이 최신 HTML을 우선하지 않습니다.');
assert(!worker.includes('ignoreSearch'), '자산 캐시가 버전 쿼리를 무시하고 있습니다.');

console.log(`PWA 캐시 버전 검사 통과: ${workerAssetVersion}`);
