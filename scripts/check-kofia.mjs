// 금투협 수집과 값 검증이 맞는지 확인하는 스크립트 (Plan 작업 6·7)
// 실행: npm run check:calc   (인터넷 없이, 실제 응답과 같은 모양의 가짜 자료로 확인한다)
import assert from "node:assert/strict";
import {
  fetchKofiaDay,
  parseKofiaDayXml,
  selectGovernmentYields,
} from "../src/lib/rates/kofia.ts";
import { backfillKofia, collectKofiaDay, weekdaysBetween } from "../src/lib/rates/collect-kr.ts";
import { usHolidaysFromRows } from "../src/lib/rates/collect-us.ts";
import { kofiaYieldsToRates } from "../src/lib/rates/store.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

// 실제 응답(2026-10-21)과 같은 모양: 종류명, 오전, 오후, 전일대비, 전일
function dto(name, am, pm, change, prev) {
  return `<BISComDspDatDTO>\n<val1>${name}</val1>\n<val2>3년</val2>\n<val3>${am}</val3>\n<val4>${pm}</val4>\n<val5>${change}</val5>\n<val6>  ${prev}</val6>\n<val7 />\n</BISComDspDatDTO>`;
}
function response(rows, fn = "listDay") {
  return `<?xml version="1.0" encoding="UTF-8"?><root><message><proframeHeader>\n<pfmFnName>${fn}</pfmFnName>\n</proframeHeader>\n<BISComDspDatListDTO>\n<dbio_total_count_>${rows.length}</dbio_total_count_>\n${rows.join("\n")}\n</BISComDspDatListDTO>\n</message></root>`;
}
const NORMAL = response([
  dto("국고채권(3년)", "3.832", "3.822", "-0.018", "3.840"),
  dto("국고채권(10년)", "4.170", "4.160", "-0.016", "4.176"),
  dto("국고채권(30년)", "4.246", "4.251", "-0.013", "4.264"),
  dto("한전채(3년)", "4.263", "4.256", "-0.015", "4.271"),
]);
const BEFORE_PM = response([
  dto("국고채권(3년)", "3.817", "", "-0.005", "3.822"),
  dto("국고채권(10년)", "4.148", "", "-0.012", "4.160"),
  dto("국고채권(30년)", "4.230", "", "-0.021", "4.251"),
]);
const EMPTY = response([]);

await check("응답 읽기: 줄 수와 칸을 정확히 읽는다", () => {
  const rows = parseKofiaDayXml(NORMAL);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    name: "국고채권(3년)", morning: "3.832", afternoon: "3.822", change: "-0.018", previous: "3.840",
  });
});
await check("응답 읽기: 다른 서비스 응답이면 오류", () => {
  assert.throws(() => parseKofiaDayXml(response([], "getExistMaxDate")), /형식이 달라졌/);
  assert.throws(() => parseKofiaDayXml("<html>점검 중</html>"), /형식이 달라졌/);
});
await check("응답 읽기: 알려 준 건수와 줄 수가 다르면 오류(잘린 응답)", () => {
  const cut = NORMAL.replace("<dbio_total_count_>4<", "<dbio_total_count_>9<");
  assert.throws(() => parseKofiaDayXml(cut), /줄 수가 맞지 않/);
});
await check("국고채만 고른다: 한전채·회사채는 섞이지 않는다", () => {
  const result = selectGovernmentYields("2026-10-21", parseKofiaDayXml(NORMAL));
  assert.equal(result.status, "ok");
  assert.deepEqual(result.yields, [
    { instrument: "kr3", rate: 3.822 },
    { instrument: "kr10", rate: 4.16 },
    { instrument: "kr30", rate: 4.251 },
  ]);
  assert.deepEqual(result.rejected, []);
});
await check("오후(최종) 값을 쓴다: 오전 값은 쓰지 않는다", () => {
  const result = selectGovernmentYields("2026-10-21", parseKofiaDayXml(NORMAL));
  assert.notEqual(result.yields[0].rate, 3.832);
});
await check("공시 전(오후 값 비어 있음): 오전 값으로 채우지 않고 '대기'", () => {
  const result = selectGovernmentYields("2026-10-22", parseKofiaDayXml(BEFORE_PM));
  assert.equal(result.status, "waiting");
  assert.deepEqual(result.yields, []);
});
await check("자료 없음(휴장일): no-data", () => {
  const result = selectGovernmentYields("2026-10-24", parseKofiaDayXml(EMPTY));
  assert.equal(result.status, "no-data");
});
await check("형식이 틀린 값은 저장하지 않는다(그 종목만 미수집)", () => {
  const xml = response([
    dto("국고채권(3년)", "3.832", "N/A", "-0.018", "3.840"),
    dto("국고채권(10년)", "4.170", "4.160", "-0.016", "4.176"),
    dto("국고채권(30년)", "4.246", "99.999", "-0.013", "4.264"),
  ]);
  const result = selectGovernmentYields("2026-10-21", parseKofiaDayXml(xml));
  assert.deepEqual(result.yields, [{ instrument: "kr10", rate: 4.16 }]);
  assert.deepEqual(result.rejected.map((r) => r.instrument).sort(), ["kr3", "kr30"]);
});
await check("대비와 전일이 맞지 않으면(칸이 밀린 응답) 저장하지 않는다", () => {
  const xml = response([
    dto("국고채권(3년)", "3.832", "3.822", "-0.100", "3.840"),
    dto("국고채권(10년)", "4.170", "4.160", "-0.016", "4.176"),
    dto("국고채권(30년)", "4.246", "4.251", "-0.013", "4.264"),
  ]);
  const result = selectGovernmentYields("2026-10-21", parseKofiaDayXml(xml));
  assert.equal(result.yields.some((y) => y.instrument === "kr3"), false);
  assert.equal(result.rejected[0].reason, "전일대비와 맞지 않음");
});
await check("국고채 줄이 없거나 두 개면 그 종목은 미수집", () => {
  const xml = response([
    dto("국고채권(3년)", "1", "3.822", "-0.018", "3.840"),
    dto("국고채권(3년)", "1", "3.700", "-0.018", "3.718"),
    dto("국고채권(10년)", "4.170", "4.160", "-0.016", "4.176"),
  ]);
  const result = selectGovernmentYields("2026-10-21", parseKofiaDayXml(xml));
  assert.deepEqual(result.yields, [{ instrument: "kr10", rate: 4.16 }]);
  assert.equal(result.rejected.length, 2);
});
await check("요청: 고정 주소로 POST, 날짜는 YYYYMMDD로 넣는다", async () => {
  let seen;
  const fake = async (url, init) => { seen = { url, init }; return new Response(NORMAL); };
  await fetchKofiaDay("2026-10-21", fake);
  assert.equal(seen.url, "https://www.kofiabond.or.kr/proframeWeb/XMLSERVICES/");
  assert.equal(seen.init.method, "POST");
  assert.match(seen.init.body, /<val1>20261021<\/val1>/);
  assert.match(seen.init.body, /<pfmFnName>listDay<\/pfmFnName>/);
});
await check("요청: 날짜가 이상하면 요청을 보내지 않는다(본문 끼워넣기 방지)", async () => {
  let called = false;
  const fake = async () => { called = true; return new Response(NORMAL); };
  for (const bad of ["2026-02-30", "20261021", "2026-10-21</val1><x>", "", "abc"]) {
    await assert.rejects(() => fetchKofiaDay(bad, fake), /날짜가 올바르지/);
  }
  assert.equal(called, false);
});
await check("받기 실패(상태 오류)는 오류", async () => {
  await assert.rejects(() => fetchKofiaDay("2026-10-21", async () => new Response("x", { status: 500 })), /500/);
});
await check("저장 모양: 출처 금융투자협회, 기준일은 조회한 날짜", () => {
  const rows = kofiaYieldsToRates("2026-10-21", [{ instrument: "kr3", rate: 3.822 }]);
  assert.deepEqual(rows, [{ rate_date: "2026-10-21", instrument: "kr3", rate: 3.822, source: "금융투자협회", as_of_date: "2026-10-21" }]);
});

function fakeClient() {
  const calls = [];
  return { calls, from(table) { return { upsert(rows) { calls.push({ table, rows }); return Promise.resolve({ error: null }); } }; } };
}
await check("하루 수집: 검증을 통과한 값만 rates에 저장", async () => {
  const client = fakeClient();
  const result = await collectKofiaDay(client, "2026-10-21", async () => new Response(NORMAL));
  assert.equal(result.saved, 3);
  assert.equal(client.calls[0].table, "rates");
});
await check("평일 목록: 주말은 빼고 센다", () => {
  assert.deepEqual(weekdaysBetween("2026-10-22", "2026-10-27"), ["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27"]);
});
await check("시작값 채우기: 자료 없는 평일은 휴장일로 기록, 오늘은 기록하지 않는다", async () => {
  const client = fakeClient();
  const answers = { "20261020": NORMAL, "20261021": EMPTY, "20261022": BEFORE_PM };
  const fake = async (_url, init) => {
    const date = /<val1>(\d{8})<\/val1>/.exec(init.body)[1];
    return new Response(answers[date]);
  };
  const result = await backfillKofia(client, "2026-10-20", "2026-10-22", { today: "2026-10-22", fetchImpl: fake, delayMs: 0 });
  assert.equal(result.tradingDays, 1);
  assert.equal(result.waiting, 1);
  assert.equal(result.holidays, 1);
  const holidayCall = client.calls.find((c) => c.table === "holidays");
  assert.deepEqual(holidayCall.rows, [{ market: "kr", holiday_date: "2026-10-21", name: "휴장일(금투협 자료 없음)" }]);
});
await check("미국 휴장일: 자료 첫 날~마지막 날 사이 빈 평일만", () => {
  const rows = [{ date: "2026-10-12", rate: 5 }, { date: "2026-10-14", rate: 5 }, { date: "2026-10-15", rate: 5 }];
  assert.deepEqual(usHolidaysFromRows(rows).map((h) => h.holiday_date), ["2026-10-13"]);
  assert.deepEqual(usHolidaysFromRows([]), []);
});

console.log(`\n모두 통과: ${passed}개`);
