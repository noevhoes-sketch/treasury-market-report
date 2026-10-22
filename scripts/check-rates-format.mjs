// 변동폭 계산과 표시 규칙이 맞는지 확인하는 스크립트 (Plan 작업 3)
// 실행: npm run check:calc
import assert from "node:assert/strict";
import {
  buildReportTable,
  displayChange,
  changeInBp,
  formatChange,
  formatRate,
} from "../src/lib/calc/rates-format.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const kofia = (rate, asOf = "2026-10-22") => ({
  rate,
  source: "금융투자협회",
  asOf,
});

check("금리는 소수 셋째 자리까지 (3.8 → 3.800)", () => {
  assert.equal(formatRate(3.822), "3.822");
  assert.equal(formatRate(3.8), "3.800");
});
check("값이 없으면 \"미수집\"", () => {
  assert.equal(formatRate(null), "미수집");
  assert.equal(formatChange(null), "미수집");
});
check("변동폭: 3.822 - 3.804 = +1.8bp (부동소수점 오차 없음)", () => {
  assert.equal(changeInBp(3.822, 3.804), 1.8);
  assert.equal(formatChange(changeInBp(3.822, 3.804)), "+1.8bp");
});
check("변동폭: 하락은 -, 같으면 0.0bp", () => {
  assert.equal(formatChange(changeInBp(3.8, 3.805)), "-0.5bp");
  assert.equal(formatChange(changeInBp(3.8, 3.8)), "0.0bp");
});
check("변동폭: 한쪽이라도 없으면 계산하지 않는다", () => {
  assert.equal(changeInBp(null, 3.8), null);
  assert.equal(changeInBp(3.8, null), null);
});
check("변동폭: 0.1bp 단위가 정확하다 (0.1 + 0.2 문제 없음)", () => {
  assert.equal(changeInBp(1.003, 1.0), 0.3);
  assert.equal(changeInBp(0.3, 0.1), 20);
});
check("표: 네 종목이 정해진 순서로 나온다", () => {
  const rows = buildReportTable({});
  assert.deepEqual(
    rows.map((row) => row.instrument),
    ["kr3", "kr10", "kr30", "us10"],
  );
});
check("표: 입력이 없는 종목은 모두 \"미수집\"", () => {
  const row = buildReportTable({})[0];
  assert.equal(row.today.text, "미수집");
  assert.equal(row.changeFromPreviousDay.text, "미수집");
  assert.equal(row.today.source, null);
});
check("표: 값이 있으면 금리·변동폭·출처·기준일이 함께 나온다", () => {
  const row = buildReportTable({
    kr3: {
      today: kofia(3.822),
      previousDay: kofia(3.804, "2026-10-21"),
      previousMonthEnd: kofia(3.9, "2026-09-30"),
      previousYearEnd: kofia(3.5, "2025-12-30"),
    },
  })[0];
  assert.equal(row.today.text, "3.822");
  assert.equal(row.today.source, "금융투자협회");
  assert.equal(row.previousDay.asOf, "2026-10-21");
  assert.equal(row.changeFromPreviousDay.text, "+1.8bp");
  assert.equal(row.changeFromMonthEnd.text, "-7.8bp");
  assert.equal(row.changeFromYearEnd.text, "+32.2bp");
});
check("표: 기준일 값이 없으면 그 변동폭만 \"미수집\"", () => {
  const row = buildReportTable({
    kr10: {
      today: kofia(3.9),
      previousDay: kofia(3.88, "2026-10-21"),
      previousMonthEnd: null,
      previousYearEnd: null,
    },
  })[1];
  assert.equal(row.changeFromPreviousDay.text, "+2.0bp");
  assert.equal(row.changeFromMonthEnd.text, "미수집");
  assert.equal(row.changeFromYearEnd.text, "미수집");
  assert.equal(row.previousMonthEnd.text, "미수집");
});
check("표: 보류 중인 금일 값은 \"확인 중\"으로 가리고 변동폭도 가린다", () => {
  const row = buildReportTable({
    kr30: {
      today: { ...kofia(4.2), held: true },
      previousDay: kofia(3.9, "2026-10-21"),
      previousMonthEnd: null,
      previousYearEnd: null,
    },
  })[2];
  assert.equal(row.today.text, "확인 중");
  assert.equal(row.changeFromPreviousDay.text, "확인 중");
  assert.equal(row.previousDay.text, "3.900");
});
check("표: 미국 줄은 최신 마감일(기준일)이 한국과 달라도 그대로 보인다", () => {
  const row = buildReportTable({
    us10: {
      today: { rate: 4.25, source: "미국 재무부", asOf: "2026-10-21" },
      previousDay: { rate: 4.2, source: "미국 재무부", asOf: "2026-10-20" },
      previousMonthEnd: null,
      previousYearEnd: null,
    },
  })[3];
  assert.equal(row.today.asOf, "2026-10-21");
  assert.equal(row.changeFromPreviousDay.text, "+5.0bp");
});

check("화면 표기: 상승은 +, 하락은 마이너스 대신 △, 그 밖의 글자는 그대로", () => {
  assert.equal(displayChange("+1.8bp"), "+1.8bp");
  assert.equal(displayChange("-1.8bp"), "△1.8bp");
  assert.equal(displayChange("-17.1bp"), "△17.1bp");
  assert.equal(displayChange("0.0bp"), "0.0bp");
  assert.equal(displayChange("미수집"), "미수집");
  assert.equal(displayChange("확인 중"), "확인 중");
  // 계산·문장 검사에 쓰는 원래 표기는 바뀌지 않는다
  assert.equal(formatChange(-1.8), "-1.8bp");
});

console.log(`\n모두 통과: ${passed}개`);
