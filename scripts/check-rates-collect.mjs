// 미국 재무부 수집과 값 검증이 맞는지 확인하는 스크립트 (Plan 작업 5·7)
// 실행: npm run check:calc   (인터넷 없이 가짜 자료로 확인한다)
import assert from "node:assert/strict";
import {
  isValidDateString,
  parseRateText,
  usDateToIso,
} from "../src/lib/rates/validate.ts";
import {
  fetchTreasuryTenYear,
  latestOnOrBefore,
  parseTreasuryCsv,
} from "../src/lib/rates/ustreasury.ts";
import { upsertRates, usRowsToRates } from "../src/lib/rates/store.ts";
import { collectUsTenYear } from "../src/lib/rates/collect-us.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const SAMPLE = [
  'Date,"1 Mo","2 Yr","10 Yr","30 Yr"',
  "10/21/2026,4.09,4.81,5.13,5.42",
  "10/20/2026,4.10,4.79,5.12,5.42",
  "10/19/2026,4.11,4.77,N/A,5.48",
  "10/16/2026,4.12,4.74,5.09,5.43",
  "02/30/2026,4.00,4.00,5.00,5.00",
  "10/15/2026,4.17,4.77,,5.43",
  "10/14/2026,4.11,4.82,abc,5.52",
  "10/13/2026,4.10,4.79,25.00,5.56",
].join("\n");

await check("금리 문자열: 올바른 값만 숫자로", () => {
  assert.equal(parseRateText("3.822"), 3.822);
  assert.equal(parseRateText(" 5.13 "), 5.13);
  assert.equal(parseRateText("0.00"), 0);
});
await check("금리 문자열: 빈 값·N/A·쉼표·문자 섞임·범위 밖은 null", () => {
  for (const bad of ["", "N/A", "3,822", "3.8a", "-1.00", "20.50", "100.00", "3", "3.8", ".5", null, undefined, 3.8]) {
    assert.equal(parseRateText(bad), null, `받으면 안 되는 값: ${String(bad)}`);
  }
});
await check("날짜: 없는 날짜(2/30)와 이상한 모양은 거른다", () => {
  assert.equal(isValidDateString("2026-10-21"), true);
  assert.equal(isValidDateString("2026-02-30"), false);
  assert.equal(isValidDateString("2026/10/21"), false);
  assert.equal(usDateToIso("10/21/2026"), "2026-10-21");
  assert.equal(usDateToIso("02/30/2026"), null);
  assert.equal(usDateToIso("2026-10-21"), null);
});
await check("재무부 CSV: 10년물만 뽑고, 틀린 줄은 건너뛴다(추정하지 않음)", () => {
  const { rows, skipped } = parseTreasuryCsv(SAMPLE);
  assert.deepEqual(rows, [
    { date: "2026-10-21", rate: 5.13 },
    { date: "2026-10-20", rate: 5.12 },
    { date: "2026-10-16", rate: 5.09 },
  ]);
  assert.equal(skipped, 5);
});
await check("재무부 CSV: 열 이름이 달라지면 조용히 넘어가지 않고 오류", () => {
  assert.throws(() => parseTreasuryCsv("Date,Foo\n10/21/2026,1.00"), /열 이름/);
  assert.throws(() => parseTreasuryCsv(""), /비어/);
});
await check("재무부 CSV: 열 순서가 바뀌어도 이름으로 찾는다", () => {
  const { rows } = parseTreasuryCsv('"10 Yr",Date\n5.13,10/21/2026');
  assert.deepEqual(rows, [{ date: "2026-10-21", rate: 5.13 }]);
});
await check("연도가 이상하면 주소를 만들지 않는다(주소 끼워넣기 방지)", async () => {
  let called = false;
  const fake = async () => { called = true; return new Response(""); };
  await assert.rejects(() => fetchTreasuryTenYear(2026.5, fake), /연도/);
  await assert.rejects(() => fetchTreasuryTenYear(Number("2026/../x"), fake), /연도/);
  assert.equal(called, false);
});
await check("받기 실패(상태 오류)는 저장하지 않고 오류", async () => {
  const fake = async () => new Response("no", { status: 503 });
  await assert.rejects(() => fetchTreasuryTenYear(2026, fake), /503/);
});
await check("미국 날짜 선택: 기준일 이전의 가장 최근 값(최신 마감일)", () => {
  const { rows } = parseTreasuryCsv(SAMPLE);
  assert.equal(latestOnOrBefore(rows, "2026-10-22").date, "2026-10-21");
  assert.equal(latestOnOrBefore(rows, "2026-10-18").date, "2026-10-16");
  assert.equal(latestOnOrBefore(rows, "2026-01-01"), null);
});
await check("저장 모양: 날짜·출처·기준일이 재무부 자료 그대로", () => {
  const [row] = usRowsToRates([{ date: "2026-10-21", rate: 5.13 }]);
  assert.deepEqual(row, {
    rate_date: "2026-10-21",
    instrument: "us10",
    rate: 5.13,
    source: "미국 재무부",
    as_of_date: "2026-10-21",
    is_manual: false,
  });
});

// 가짜 데이터베이스 연결: 저장 요청을 기록만 한다.
function fakeClient(failWith = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(rows, options) {
          calls.push({ table, count: rows.length, options });
          return Promise.resolve({ error: failWith ? { message: failWith } : null });
        },
      };
    },
  };
}

await check("저장: 같은 날·같은 종목은 덮어쓰는 방식(onConflict)으로 저장", async () => {
  const client = fakeClient();
  const saved = await upsertRates(client, usRowsToRates(parseTreasuryCsv(SAMPLE).rows));
  assert.equal(saved, 3);
  assert.equal(client.calls[0].table, "rates");
  assert.equal(client.calls[0].options.onConflict, "rate_date,instrument");
});
await check("저장: 많은 줄은 200줄씩 나눠 보낸다", async () => {
  const client = fakeClient();
  const rates = Array.from({ length: 450 }, (_, i) => ({
    rate_date: "2026-01-01", instrument: "us10", rate: 4, source: "미국 재무부", as_of_date: "2026-01-01", i,
  }));
  await upsertRates(client, rates);
  assert.deepEqual(client.calls.map((c) => c.count), [200, 200, 50]);
});
await check("저장 실패는 조용히 넘어가지 않고 오류", async () => {
  await assert.rejects(() => upsertRates(fakeClient("권한 없음"), usRowsToRates([{ date: "2026-10-21", rate: 5.13 }])), /저장하지 못했습니다/);
});
await check("수집: 연도별로 받아 저장하고 가장 최근 날짜를 알려준다", async () => {
  const client = fakeClient();
  const fake = async () => new Response(SAMPLE);
  const result = await collectUsTenYear(client, [2025, 2026], fake);
  assert.equal(result.saved, 6);
  assert.equal(result.skipped, 10);
  assert.equal(result.latestDate, "2026-10-21");
  assert.equal(client.calls.filter((c) => c.table === "rates").length, 2);
  assert.equal(result.holidays, 1); // 10/19는 자료가 없는 평일이라 미국 휴장일로 기록
});

console.log(`\n모두 통과: ${passed}개`);
