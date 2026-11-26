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
      tgEligible, jgEligible, jhEligible, tagsForMonth,
      state, groupOverrideMap, desigMapFor, memosFor, clearRange,
      GROUPS, OFFICE_GROUP, familyDayStr, isFamilyDayCandidate, familyDayDom, officeFamilyDayDom
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

// 실제 발견 사례: 8/7 특휴로 자동 지근·지휴가 6개가 된 상태에서
// 8/17 수동 지근이 남아도, 수동 날짜는 보존하면서 다른 자동 지근을 특근으로 넘겨 1:1 유지.
api.groupOverrideMap('A')['2026-08-07'] = 'TH';
api.desigMapFor('A')['2026-08-17'] = 'JG';
const specialLeaveWithManualJg = api.tagsForMonth('A', 2026, 7);
const specialLeaveJgCount = Object.values(specialLeaveWithManualJg).filter(value => value.tag === 'JG').length;
const specialLeaveJhCount = Object.values(specialLeaveWithManualJg).filter(value => value.tag === 'JH').length;
assert(specialLeaveJgCount === 6, `특휴+수동 지근 상태의 지근이 6개가 아닙니다: ${specialLeaveJgCount}`);
assert(specialLeaveJhCount === 6, `특휴+수동 지근 상태의 지휴가 6개가 아닙니다: ${specialLeaveJhCount}`);
assert(specialLeaveWithManualJg['2026-08-17']?.tag === 'JG', '수동 지정한 2026-08-17 지근이 보존되지 않았습니다.');
assert(specialLeaveWithManualJg['2026-08-17']?.n === 6, '2026-08-17 지근 번호가 6으로 재정렬되지 않았습니다.');
assert(specialLeaveWithManualJg['2026-08-16']?.tag === 'TG', '초과 자동 지근이 특근으로 조정되지 않았습니다.');
delete api.groupOverrideMap('A')['2026-08-07'];
delete api.desigMapFor('A')['2026-08-17'];

/* ---------- 오피스조(O조) ----------
   주기 패턴이 아니라 달력으로 정해진다: 월~금 오피스 근무, 주말·공휴일 휴무.
   패밀리데이는 근무를 바꾸지 않고 💛 참고 표시만 한다(2026-11-26 사용자 요청). */
assert(api.GROUPS.includes('O') && api.OFFICE_GROUP === 'O', '오피스조(O)가 조 목록에 없습니다.');

let officeChecked = 0, officeWork = 0, officeFamilyDays = 0;
for(let y = 2026; y <= 2027; y++){
  for(let m = 0; m < 12; m++){
    const dim = new Date(y, m + 1, 0).getDate();
    for(let d = 1; d <= dim; d++){
      const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const key = api.shiftFor(ds, 'O');
      const restDay = api.isWeekend(ds) || api.isHoliday(ds);
      if(restDay) assert(key === 'OFF', `${ds} 오피스조는 쉬는 날이어야 합니다(주말·공휴일).`);
      else { assert(key === 'O', `${ds} 오피스조가 오피스 근무가 아닙니다: ${key}`); officeWork++; }
      officeChecked++;
    }
    // 태그(지근·지휴·특근)는 오피스조에 붙지 않는다
    const officeTags = api.tagsForMonth('O', y, m);
    assert(Object.keys(officeTags).length === 0, `${y}-${m+1} 오피스조에 정산 태그가 붙었습니다.`);

    // 패밀리데이: 급여일(21일)까지 포함한 직전 금요일 = 15~21일 사이 금요일
    const famDs = api.familyDayStr(y, m, 'O');
    const famDay = Number(famDs.slice(8));
    const famDow = new Date(y, m, famDay).getDay();
    assert(famDow === 5, `${famDs} 오피스조 패밀리데이가 금요일이 아닙니다.`);
    assert(famDay >= 15 && famDay <= 21, `${famDs} 오피스조 패밀리데이가 15~21일 범위를 벗어났습니다.`);
    assert(api.isFamilyDayCandidate(famDs, 'O'), `${famDs}가 오피스조 패밀리데이로 인식되지 않습니다.`);
    // 교대조는 같은 달에 5~11일 금요일로 따로 계산된다
    const shiftFamDay = api.familyDayDom(y, m);
    assert(shiftFamDay >= 5 && shiftFamDay <= 11, `${y}-${m+1} 교대조 패밀리데이가 5~11일 범위를 벗어났습니다.`);
    assert(new Date(y, m, shiftFamDay).getDay() === 5, `${y}-${m+1} 교대조 패밀리데이가 금요일이 아닙니다.`);
    // 참고 표시일 뿐이라 근무는 그대로(평일이면 오피스 근무, 공휴일이면 휴무)
    const famShift = api.shiftFor(famDs, 'O');
    assert(famShift !== 'FAM', `${famDs} 패밀리데이가 근무표에 자동으로 들어갔습니다(참고 표시만 해야 합니다).`);
    if(famShift === 'O') officeFamilyDays++;
  }
}

/* ---------- 기간 되돌리기 ----------
   달력에서 여러 날을 잡아 '수동변경·메모 지우기'를 누르면 메모도 함께 지워집니다.
   공유방을 쓰는 중이라면 클라우드에도 지웠다고 알려야 합니다. 안 그러면 구름에 값이 남아
   다음 동기화 때 지운 메모가 그대로 되살아납니다. */
const sharedMemoWrites = [];
/* 브라우저에선 window.Sync와 전역 Sync가 같은 것이라 둘 다 꽂아 줍니다. */
const fakeSync = { saveMemo: (group, date, value) => sharedMemoWrites.push([group, date, value]) };
sandbox.window.Sync = fakeSync;
sandbox.Sync = fakeSync;

api.memosFor('A')['2026-08-10'] = '교육';
api.memosFor('A')['2026-08-11'] = '비번';
api.groupOverrideMap('A')['2026-08-10'] = 'ANN';
api.clearRange('A', ['2026-08-10', '2026-08-11', '2026-08-12']);

assert(!api.memosFor('A')['2026-08-10'], '기간 되돌리기로 메모가 지워지지 않았습니다.');
assert(!api.groupOverrideMap('A')['2026-08-10'], '기간 되돌리기로 수동 변경이 지워지지 않았습니다.');
assert(
  sharedMemoWrites.some(w => w[1] === '2026-08-10' && w[2] === ''),
  '지운 메모를 공유방에 알리지 않아, 다음 동기화 때 되살아납니다.'
);
assert(
  sharedMemoWrites.some(w => w[1] === '2026-08-11' && w[2] === ''),
  '지운 메모 중 일부만 공유방에 전달됐습니다.'
);
assert(
  !sharedMemoWrites.some(w => w[1] === '2026-08-12'),
  '원래 메모가 없던 날까지 공유방에 빈 값을 써서 보내고 있습니다.'
);
delete sandbox.window.Sync; delete sandbox.Sync;

console.log('교대캘린더 전수 검사 통과');
console.log(`공휴일: 2026년 22일, 2027년 24일`);
console.log(`검사 범위: ${totals.checkedDates}일 × 4개 조 = ${totals.checkedGroupDates}개 조별 날짜`);
console.log(`오피스조: ${officeChecked}일 검사 · 근무 ${officeWork}일 · 패밀리데이 표시 ${officeFamilyDays}개월`);
console.log(`공휴일 조별 검사: ${totals.holidayGroupDates}건`);
console.log(`자동 태그: 지근 ${totals.JG}, 지휴 ${totals.JH}, 특근 ${totals.TG}`);
