// 지난 날짜들의 등락 원인 초안을 한꺼번에 채운다. (자동 실행 주소가 하는 일을 날짜 범위로 반복한다)
// 실행: node --experimental-strip-types --no-warnings scripts/backfill-cause.mjs 2026-01-01 2026-10-22 [--delay=1500]
//       날짜를 하나만 주거나 쉼표로 여러 개를 줄 수도 있다: ... 2026-03-10,2026-05-20
//       --desc          최근 날짜부터 거꾸로 채운다
//       --only-missing  보고서 행이 아직 없는 날(빈 날)만 채운다(이미 있는 날은 읽지도 않고 건너뛴다)
// 담당자가 확정했거나 고친 보고서, 이미 초안이 있는 보고서는 건드리지 않는다. 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generateCauseDraft } from "../src/lib/cause/collect-cause.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  }),
);
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const delay = Number((process.argv.find((a) => a.startsWith("--delay=")) ?? "--delay=1500").slice(8));
let dates;
if (args[0]?.includes(",") || (args.length === 1 && args[0])) {
  dates = args[0].split(",");
} else {
  const [from, to] = args;
  const { data, error } = await client.from("rates").select("rate_date").eq("instrument", "kr3").gte("rate_date", from).lte("rate_date", to).order("rate_date");
  if (error) throw new Error(error.message);
  dates = data.map((r) => r.rate_date);
}

if (process.argv.includes("--only-missing")) {
  const { data, error } = await client.from("reports").select("report_date").in("report_date", dates);
  if (error) throw new Error(error.message);
  const have = new Set(data.map((row) => row.report_date));
  dates = dates.filter((date) => !have.has(date));
}
if (process.argv.includes("--desc")) dates = [...dates].sort().reverse();
console.log(`대상 ${dates.length}일${process.argv.includes("--desc") ? " (최근 날짜순)" : ""}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tally = {};
const lines = [];
let n = 0;
for (const date of dates) {
  n += 1;
  let result;
  try {
    result = await generateCauseDraft(client, date, { apiKey: env.OPENAI_API_KEY ?? "", model: env.OPENAI_MODEL || undefined });
    if (result.status === "ai-failed") { await sleep(3000); result = await generateCauseDraft(client, date, { apiKey: env.OPENAI_API_KEY ?? "", model: env.OPENAI_MODEL || undefined }); }
  } catch (e) {
    result = { date, status: "error", message: e instanceof Error ? e.message.slice(0, 80) : "오류" };
  }
  tally[result.status] = (tally[result.status] ?? 0) + 1;
  const note = result.status === "stored" ? ` 국고채:${result.kr} / 미국:${result.us}` : result.message ? ` ${result.message}` : "";
  const line = `${n}/${dates.length} ${date} ${result.status}${note}`;
  lines.push(line);
  console.log(line);
  await sleep(delay);
}
console.log("\n요약:", JSON.stringify(tally));
