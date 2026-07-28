'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const startCall = appSource.lastIndexOf('renderWeekdays();');
if(startCall < 0) throw new Error('app.js 시작 지점을 찾지 못했습니다.');

const sandbox = {
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
  console,
  Date,
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
};

vm.runInNewContext(
  appSource.slice(0, startCall) + `
    globalThis.calendarApi = {
      HOLIDAYS, holidayName, isHoliday, isWeekend, isWeekday,
      shiftFor, isWorkerOff, isLeaveDay,
      tgEligible, jgEligible, jhEligible, tagsForMonth
    };
  `,
  sandbox
);

const api = sandbox.calendarApi;
const GROUPS = ['A', 'B', 'C', 'D'];
const EXPECTED_HOLIDAYS = {
  '2026-01-01':'신정',
  '2026-02-16':'설날','2026-02-17':'설날','2026-02-18':'설날',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체',
  '2026-05-01':'노동절','2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날','2026-05-25':'부처님오신날 대체',
  '2026-06-03':'지방선거','2026-06-06':'현충일',
  '2026-07-17':'제헌절',
  '2026-08-15':'광복절','2026-08-17':'광복절 대체',
  '2026-09-24':'추석','2026-09-25':'추석','2026-09-26':'추석',
  '2026-10-03':'개천절','2026-10-05':'개천절 대체',
  '2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
  '2027-01-01':'신정',
  '2027-02-06':'설날','2027-02-07':'설날','2027-02-08':'설날','2027-02-09':'설날 대체',
  '2027-03-01':'삼일절',
  '2027-05-01':'노동절','2027-05-03':'노동절 대체','2027-05-05':'어린이날',
  '2027-05-13':'부처님오신날',
  '2027-06-06':'현충일',
  '2027-07-17':'제헌절','2027-07-19':'제헌절 대체',
  '2027-08-15':'광복절','2027-08-16':'광복절 대체',
  '2027-09-14':'추석','2027-09-15':'추석','2027-09-16':'추석',
  '2027-10-03':'개천절','2027-10-04':'개천절 대체',
  '2027-10-09':'한글날','2027-10-11':'한글날 대체',
  '2027-12-25':'크리스마스','2027-12-27':'크리스마스 대체',
};

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function pad(number){
  return String(number).padStart(2, '0');
}

function sameEntries(actual, expected){
  const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

assert(
  sameEntries(api.HOLIDAYS, EXPECTED_HOLIDAYS),
  '2026·2027 공휴일 목록 또는 이름이 공식 대조표와 다릅니다.'
);

const totals = {
  checkedDates: 0,
  checkedGroupDates: 0,
  holidayGroupDates: 0,
  JG: 0,
  JH: 0,
  TG: 0,
};

for(const year of [2026, 2027]){
  const expectedYearCount = year === 2026 ? 22 : 24;
  const actualYearCount = Object.keys(api.HOLIDAYS).filter(date => date.startsWith(`${year}-`)).length;
  assert(actualYearCount === expectedYearCount, `${year}년 공휴일 수가 ${expectedYearCount}일이 아닙니다.`);

  for(let month = 0; month < 12; month++){
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    totals.checkedDates += daysInMonth;

    for(const group of GROUPS){
      const tagMap = api.tagsForMonth(group, year, month);
      const holidayWork = [];
      const weekdayOff = [];

      for(let day = 1; day <= daysInMonth; day++){
        const date = `${year}-${pad(month + 1)}-${pad(day)}`;
        const off = api.isWorkerOff(date, group);
        totals.checkedGroupDates++;

        if(!off && (api.isWeekend(date) || api.isHoliday(date))) holidayWork.push(date);
        if(off && !api.isLeaveDay(date, group) && api.isWeekday(date) && !api.isHoliday(date)){
          weekdayOff.push(date);
        }

        if(api.isHoliday(date)){
          totals.holidayGroupDates++;
          assert(!api.jhEligible(date, group), `${date} ${group}조 공휴일이 지휴 후보로 잡혔습니다.`);
          if(off){
            assert(!tagMap[date], `${date} ${group}조 휴무 공휴일에 태그가 붙었습니다.`);
          }else{
            assert(api.jgEligible(date, group), `${date} ${group}조 공휴일 근무가 지근 후보가 아닙니다.`);
            assert(api.tgEligible(date, group), `${date} ${group}조 공휴일 근무가 특근 후보가 아닙니다.`);
            assert(
              tagMap[date] && (tagMap[date].tag === 'JG' || tagMap[date].tag === 'TG'),
              `${date} ${group}조 공휴일 근무에 지근/특근이 없습니다.`
            );
          }
        }
      }

      const pairCount = Math.min(holidayWork.length, weekdayOff.length);
      const expectedTags = {};
      holidayWork.slice(0, pairCount).forEach(date => { expectedTags[date] = 'JG'; });
      weekdayOff.slice(0, pairCount).forEach(date => { expectedTags[date] = 'JH'; });
      holidayWork.slice(pairCount).forEach(date => { expectedTags[date] = 'TG'; });

      for(let day = 1; day <= daysInMonth; day++){
        const date = `${year}-${pad(month + 1)}-${pad(day)}`;
        const actualTag = tagMap[date] ? tagMap[date].tag : null;
        const expectedTag = expectedTags[date] || null;
        assert(actualTag === expectedTag, `${date} ${group}조 태그: 예상 ${expectedTag}, 실제 ${actualTag}`);
        if(actualTag) totals[actualTag]++;
      }

      const jgCount = Object.values(tagMap).filter(value => value.tag === 'JG').length;
      const jhCount = Object.values(tagMap).filter(value => value.tag === 'JH').length;
      assert(jgCount === jhCount, `${year}-${pad(month + 1)} ${group}조 지근·지휴가 1:1이 아닙니다.`);
    }
  }
}

const aAugust2026 = api.tagsForMonth('A', 2026, 7);
assert(aAugust2026['2026-08-17']?.tag === 'JG', '2026-08-17 A조가 지근이 아닙니다.');
assert(aAugust2026['2026-08-17']?.n === 7, '2026-08-17 A조 지근 번호가 7이 아닙니다.');
assert(aAugust2026['2026-08-22']?.tag === 'TG', '2026-08-22 A조가 특근으로 순연되지 않았습니다.');

console.log('교대 캘린더 전수 검사 통과');
console.log(`공휴일: 2026년 22일, 2027년 24일`);
console.log(`검사 범위: ${totals.checkedDates}일 × 4개 조 = ${totals.checkedGroupDates}개 조별 날짜`);
console.log(`공휴일 조별 검사: ${totals.holidayGroupDates}건`);
console.log(`자동 태그: 지근 ${totals.JG}, 지휴 ${totals.JH}, 특근 ${totals.TG}`);
