'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

assert(!app.includes('class="cell-hol"'), '달력 카드에 공휴일명이 다시 표시되고 있습니다.');
assert(
  app.includes('${DESIG[ti.tag].short}</span>'),
  '달력 카드의 정산 태그가 지근·지휴·특근 공통 라벨이 아닙니다.'
);
assert(
  app.includes('<span class="cell-top"><span class="dnum ${dnumCls}">${d}</span>${tagHtml}</span>'),
  '날짜 오른쪽 정산 태그 구조가 변경됐습니다.'
);
assert(
  app.includes('<span class="sh-hol">🔴 ${escapeHtml(hol)}</span>'),
  '날짜 상세창에서 공휴일명을 확인할 수 없습니다.'
);
assert(
  css.includes('grid-template-columns:auto minmax(0,1fr) auto;'),
  '날짜·정산 태그의 고정 행 구조가 없습니다.'
);
assert(
  !css.includes('border-left:2px solid rgba(182,107,22,.58)'),
  '달력 메모에 장식성 세로선이 다시 생겼습니다.'
);
assert(
  !css.includes('box-shadow:inset 3px 0 0 #4d9b8f'),
  '공동 메모 입력창에 장식성 세로선이 다시 생겼습니다.'
);

console.log('달력 카드 정보 구조 검사 통과');
