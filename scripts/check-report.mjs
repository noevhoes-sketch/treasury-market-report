// 보고서 표의 기준값 고르기·이상값 판단·자동 실행 잠금이 맞는지 확인하는 스크립트 (Plan 작업 8·9·11)
// 실행: npm run check:calc
import assert from "node:assert/strict";
import { nextBusinessDay, previousBusinessDay, toHolidaySet } from "../src/lib/calc/business-days.ts";
import { OUTLIER_THRESHOLD_BP, isOutlier } from "../src/lib/calc/outlier.ts";
import { endOfPreviousMonth, endOfPreviousYear, pickInstrumentInput, pickReportInputs } from "../src/lib/calc/report-table.ts";
import { buildReportTable } from "../src/lib/calc/rates-format.ts";
import { verifyCronAuth } from "../src/lib/auth/cron.ts";

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`✅ ${name}`); }

const rec = (instrument, rate_date, rate, extra = {}) => ({
  instrument, rate_date, rate, source: instrument === "us10" ? "미국 재무부" : "금융투자협회", as_of_date: rate_date, held: false, ...extra,
});

check("지난달·지난해 마지막 날(달력)", () => {
  assert.equal(endOfPreviousMonth("2026-10-22"), "2026-09-30");
  assert.equal(endOfPreviousMonth("2026-01-05"), "2025-12-31");
  assert.equal(endOfPreviousMonth("2026-03-01"), "2026-02-28");
  assert.equal(endOfPreviousYear("2026-10-22"), "2025-12-31");
});
check("국고채: 금일은 보고서 날짜의 값, 전일은 그 앞의 가장 최근 값", () => {
  const input = pickInstrumentInput([rec("kr3", "2026-10-20", 3.84), rec("kr3", "2026-10-21", 3.822), rec("kr3", "2026-10-22", 3.817)], "2026-10-22", "kr");
  assert.equal(input.today.rate, 3.817);
  assert.equal(input.previousDay.rate, 3.822);
});
check("국고채: 그날 값이 아직 없으면 금일은 비우고, 전일은 가장 최근 값", () => {
  const input = pickInstrumentInput([rec("kr3", "2026-10-20", 3.84), rec("kr3", "2026-10-21", 3.822)], "2026-10-22", "kr");
  assert.equal(input.today, null);
  assert.equal(input.previousDay.rate, 3.822);
});
check("국고채: 휴장일을 건너뛴 전일(월요일 → 금요일)", () => {
  const input = pickInstrumentInput([rec("kr3", "2026-10-16", 3.9), rec("kr3", "2026-10-19", 3.8)], "2026-10-19", "kr");
  assert.equal(input.previousDay.asOf, "2026-10-16");
});
check("전월말·전년말: 기준 날짜 이전 가장 최근 값(휴장이면 그 앞 값)", () => {
  const records = [rec("kr3", "2025-12-30", 2.95), rec("kr3", "2025-12-31", 2.953), rec("kr3", "2026-09-29", 4.0), rec("kr3", "2026-09-30", 4.011), rec("kr3", "2026-10-01", 4.1), rec("kr3", "2026-10-22", 3.817)];
  const input = pickInstrumentInput(records, "2026-10-22", "kr");
  assert.equal(input.previousYearEnd.asOf, "2025-12-31");
  assert.equal(input.previousMonthEnd.asOf, "2026-09-30");
  const holiday = pickInstrumentInput(records.filter((r) => r.rate_date !== "2026-09-30"), "2026-10-22", "kr");
  assert.equal(holiday.previousMonthEnd.asOf, "2026-09-29");
});
check("미국: 금일은 보고서 날짜 이전 가장 최근 값(최신 마감일), 기준일이 그대로 보인다", () => {
  const input = pickInstrumentInput([rec("us10", "2026-10-20", 5.12), rec("us10", "2026-10-21", 5.13)], "2026-10-22", "us");
  assert.equal(input.today.rate, 5.13);
  assert.equal(input.today.asOf, "2026-10-21");
  assert.equal(input.previousDay.asOf, "2026-10-20");
});
check("미국: 같은 날짜의 미국 값은 그 보고서에 쓰지 않는다(한국 날짜 R의 보고서에는 R 이전 값)", () => {
  const input = pickInstrumentInput([rec("us10", "2026-10-19", 5.15), rec("us10", "2026-10-20", 5.12), rec("us10", "2026-10-21", 5.13)], "2026-10-21", "us");
  assert.equal(input.today.asOf, "2026-10-20");
  assert.equal(input.previousDay.asOf, "2026-10-19");
});
check("표 만들기: 네 종목이 한꺼번에, 변동폭까지 맞게 나온다", () => {
  const records = [
    rec("kr3", "2026-10-21", 3.822), rec("kr3", "2026-10-22", 3.817), rec("kr3", "2025-12-31", 2.953), rec("kr3", "2026-09-30", 4.011),
    rec("us10", "2026-10-20", 5.12), rec("us10", "2026-10-21", 5.13),
  ];
  const rows = buildReportTable(pickReportInputs(records, "2026-10-22"));
  const kr3 = rows.find((r) => r.instrument === "kr3");
  assert.equal(kr3.today.text, "3.817");
  assert.equal(kr3.changeFromPreviousDay.text, "-0.5bp");
  assert.equal(kr3.changeFromMonthEnd.text, "-19.4bp");
  assert.equal(kr3.changeFromYearEnd.text, "+86.4bp");
  assert.equal(rows.find((r) => r.instrument === "kr10").today.text, "미수집");
  assert.equal(rows.find((r) => r.instrument === "us10").changeFromPreviousDay.text, "+1.0bp");
});
check("보류 중인 값은 화면에 확인 중으로 나온다", () => {
  const rows = buildReportTable(pickReportInputs([rec("kr3", "2026-10-21", 3.8), rec("kr3", "2026-10-22", 4.2, { held: true })], "2026-10-22"));
  assert.equal(rows[0].today.text, "확인 중");
  assert.equal(rows[0].changeFromPreviousDay.text, "확인 중");
});
check("영업일 이동: 전일·다음 영업일은 주말과 한국 휴장일을 건너뛴다", () => {
  const holidays = toHolidaySet([{ market: "kr", holiday_date: "2026-10-09" }], "kr");
  assert.equal(previousBusinessDay("2026-10-12", holidays), "2026-10-08");
  assert.equal(nextBusinessDay("2026-10-08", holidays), "2026-10-12");
  assert.equal(nextBusinessDay("2026-10-23", holidays), "2026-10-26");
});
check("이상값: 전일 대비 30bp 넘게 어긋나면 이상값", () => {
  assert.equal(OUTLIER_THRESHOLD_BP, 30);
  assert.equal(isOutlier(4.2, 3.8), true); // +40bp
  assert.equal(isOutlier(3.5, 3.8), false); // -30bp는 기준을 넘지 않음
  assert.equal(isOutlier(3.499, 3.8), true); // -30.1bp
  assert.equal(isOutlier(3.82, 3.8), false);
});
check("이상값: 전일 값이 없으면 판단하지 않는다", () => {
  assert.equal(isOutlier(9.9, null), false);
});
check("자동 실행 잠금: 비밀 값이 맞을 때만 통과", () => {
  assert.equal(verifyCronAuth("Bearer abc123", "abc123"), true);
  assert.equal(verifyCronAuth("Bearer abc124", "abc123"), false);
  assert.equal(verifyCronAuth("Bearer abc1234", "abc123"), false);
  assert.equal(verifyCronAuth("abc123", "abc123"), false);
  assert.equal(verifyCronAuth(null, "abc123"), false);
  assert.equal(verifyCronAuth("", "abc123"), false);
});
check("자동 실행 잠금: 비밀 값이 설정되지 않았으면 모두 거부", () => {
  assert.equal(verifyCronAuth("Bearer ", ""), false);
  assert.equal(verifyCronAuth("Bearer undefined", undefined), false);
  assert.equal(verifyCronAuth("Bearer x", null), false);
});

console.log(`\n모두 통과: ${passed}개`);
