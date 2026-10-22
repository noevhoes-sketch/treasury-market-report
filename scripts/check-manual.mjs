// 금리 직접 입력 검사 확인: 저장 전에 형식·범위·날짜를 거르는지 가짜 연결로 확인한다. (실제 저장은 저장소에서 확인)
// 실행: node --experimental-strip-types scripts/check-manual.mjs
import { saveManualRates } from "../src/lib/rates/manual.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };
// existing: 그날 이미 저장된 종목들. autoExisting이 참이면 그 값들이 자동 수집 값(직접 입력 아님)이다. holiday가 참이면 그날이 휴장일이다.
function fake(existing = [], opts = {}) {
  const calls = [];
  const rows = existing.map((instrument) => ({ instrument, is_manual: !opts.autoExisting }));
  return {
    calls,
    from: (table) =>
      table === "holidays"
        ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.holiday ? { holiday_date: "x" } : null, error: null }) }) }) }) }
        : { select: () => ({ eq: () => ({ in: async (_column, list) => ({ data: rows.filter((row) => list.includes(row.instrument)), error: null }) }) }), upsert: async (r) => { calls.push(r); return { error: null }; } },
  };
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
c = fake(["kr3", "kr10", "kr30"]);
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("직접 입력으로 국고채 3개가 모이면 표 상태를 완료로 올린다", r.ok && c.calls.some((x) => !Array.isArray(x) && x.table_status === "done"));
c = fake(["kr3"]);
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("3개가 안 모였으면 완료로 올리지 않는다", r.ok && !c.calls.some((x) => !Array.isArray(x) && x.table_status === "done"));
c = fake(["kr3", "kr10", "kr30"]);
r = await saveManualRates(c, { date: "2026-10-21", values: { us10: "4.10" }, usDate: "2026-10-20" });
ok("미국 값만 넣으면 표 상태는 건드리지 않는다", r.ok && c.calls.length === 1);
c = fake();
r = await saveManualRates(c, { date: "2999-01-01", values: { kr3: "3.822" } });
ok("아직 오지 않은 날짜에는 넣을 수 없다", !r.ok && c.calls.length === 0);
c = fake();
r = await saveManualRates(c, { date: "2026-10-24", values: { kr3: "3.822" } });
ok("주말에는 넣을 수 없다", !r.ok && c.calls.length === 0);
c = fake([], { holiday: true });
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("휴장일에는 넣을 수 없다", !r.ok && c.calls.length === 0);
c = fake(["kr3"], { autoExisting: true });
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("이미 자동으로 수집된 값은 직접 입력으로 바꿀 수 없다", !r.ok && /자동으로 수집/.test(r.reason) && c.calls.length === 0);
c = fake(["kr3"]);
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("직접 넣었던 값은 다시 고칠 수 있다", r.ok && c.calls.length >= 1);
c = fake(["kr10"], { autoExisting: true });
r = await saveManualRates(c, { date: "2026-10-21", values: { kr3: "3.822" } });
ok("자동 수집된 다른 종목이 있어도 비어 있는 종목은 넣을 수 있다", r.ok);
process.exit(failed ? 1 : 0);
