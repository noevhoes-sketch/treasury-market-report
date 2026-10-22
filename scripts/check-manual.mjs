// 금리 직접 입력 검사 확인: 저장 전에 형식·범위·날짜를 거르는지 가짜 연결로 확인한다. (실제 저장은 저장소에서 확인)
// 실행: node --experimental-strip-types scripts/check-manual.mjs
import { saveManualRates } from "../src/lib/rates/manual.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };
function fake() {
  const calls = [];
  return { calls, from: () => ({ upsert: async (rows) => { calls.push(rows); return { error: null }; } }) };
}

let c = fake();
let r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822", kr10: "3.9", kr30: "" } });
ok("형식이 틀린 칸(소수 한 자리)이 있으면 아무것도 저장하지 않는다", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822", kr10: "abc" } });
ok("글자가 섞이면 거절", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "25.000" } });
ok("범위(0~20) 밖은 거절", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: {} });
ok("아무 것도 안 적으면 거절", !r.ok);
c = fake();
r = await saveManualRates(c, { date: "2026-13-45", values: { kr3: "3.8" + "22" } });
ok("이상한 날짜는 거절", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { us10: "4.1" + "0" } });
ok("미국 값은 기준일 없으면 거절", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { us10: "4.10" }, usDate: "2026-10-21" });
ok("미국 기준일이 보고서 날짜와 같거나 뒤면 거절", !r.ok);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { us10: "4.10" }, usDate: "2026-10-01" });
ok("미국 기준일이 너무 오래되면 거절", !r.ok);
c = fake();
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822", us10: "4.10" }, usDate: "2026-10-20" });
const rows = c.calls[0] ?? [];
ok("올바르면 저장: 2줄", r.ok && r.saved === 2 && rows.length === 2);
ok("출처는 '담당자 직접 입력', 직접 입력 표시, 보류 아님", rows.every((x) => x.source === "담당자 직접 입력" && x.is_manual === true && x.held === false));
ok("국고채는 보고서 날짜, 미국은 입력한 기준일", rows.find((x) => x.instrument === "kr3")?.rate_date === "2026-10-21" && rows.find((x) => x.instrument === "us10")?.rate_date === "2026-10-20");
process.exit(failed ? 1 : 0);
