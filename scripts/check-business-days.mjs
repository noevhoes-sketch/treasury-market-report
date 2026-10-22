// 영업일 계산이 맞는지 확인하는 스크립트 (Plan 작업 2)
// 실행: node --experimental-strip-types scripts/check-business-days.mjs
import assert from "node:assert/strict";
import {
  isBusinessDay,
  lastBusinessDayOfPreviousMonth,
  lastBusinessDayOfPreviousYear,
  previousBusinessDay,
  reportTitle,
  todayInKorea,
} from "../src/lib/calc/business-days.ts";

// 확인용 가짜 휴장일 (실제 휴장일 자료는 holidays 표에서 온다)
const holidays = new Set(["2026-10-09", "2026-09-30", "2025-12-31"]);
const none = new Set();

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

check("제목: 10/22(목) 국채시장 동향", () => {
  assert.equal(reportTitle("2026-10-22"), "10/22(목) 국채시장 동향");
});
check("제목: 0을 붙이지 않는다 (1/5(월))", () => {
  assert.equal(reportTitle("2026-01-05"), "1/5(월) 국채시장 동향");
});
check("제목: PRD 예시 10/20은 화요일", () => {
  assert.equal(reportTitle("2026-10-20"), "10/20(화) 국채시장 동향");
});
check("토·일은 영업일이 아니다", () => {
  assert.equal(isBusinessDay("2026-10-24", none), false);
  assert.equal(isBusinessDay("2026-10-25", none), false);
  assert.equal(isBusinessDay("2026-10-23", none), true);
});
check("휴장일은 영업일이 아니다", () => {
  assert.equal(isBusinessDay("2026-10-09", holidays), false);
  assert.equal(isBusinessDay("2026-10-09", none), true);
});
check("전일: 목요일 → 수요일", () => {
  assert.equal(previousBusinessDay("2026-10-22", none), "2026-10-21");
});
check("전일: 월요일 → 지난 금요일", () => {
  assert.equal(previousBusinessDay("2026-10-19", none), "2026-10-16");
});
check("전일: 금요일이 휴장이면 목요일", () => {
  assert.equal(previousBusinessDay("2026-10-12", holidays), "2026-10-08");
});
check("전월말: 9월 30일(수)", () => {
  assert.equal(lastBusinessDayOfPreviousMonth("2026-10-22", none), "2026-09-30");
});
check("전월말: 9월 30일이 휴장이면 29일", () => {
  assert.equal(lastBusinessDayOfPreviousMonth("2026-10-22", holidays), "2026-09-29");
});
check("전월말: 1월이면 작년 12월", () => {
  assert.equal(lastBusinessDayOfPreviousMonth("2026-01-05", none), "2025-12-31");
});
check("전년말: 작년 12월 31일(수)", () => {
  assert.equal(lastBusinessDayOfPreviousYear("2026-10-22", none), "2025-12-31");
});
check("전년말: 12월 31일이 휴장이면 30일", () => {
  assert.equal(lastBusinessDayOfPreviousYear("2026-10-22", holidays), "2025-12-30");
});
check("잘못된 날짜는 오류를 낸다", () => {
  assert.throws(() => reportTitle("2026-02-30"));
  assert.throws(() => reportTitle("10/22"));
});
check("한국 날짜: UTC 15시는 한국 다음 날 0시", () => {
  assert.equal(todayInKorea(new Date("2026-10-21T15:00:00Z")), "2026-10-22");
  assert.equal(todayInKorea(new Date("2026-10-21T14:59:00Z")), "2026-10-21");
});

console.log(`\n모두 통과: ${passed}개`);
