// 금투협 국고채 3·10·30년 최종호가수익률을 받아 데이터베이스에 저장한다. (Plan 작업 6·7: 시작값 채우기)
// 자료가 없는 평일은 한국 휴장일로 함께 기록한다.
// 실행: npm run seed:kr                       (작년 1월 1일부터 오늘까지)
//       npm run seed:kr -- 2026-10-01 2026-10-21   (원하는 기간만)
// 여러 번 실행해도 같은 값이면 결과가 같다. 요청 사이에 쉬면서 하나씩 받는다. 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { todayInKorea } from "../src/lib/calc/business-days.ts";
import { backfillKofia } from "../src/lib/rates/collect-kr.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env에 없습니다.");
  process.exit(1);
}
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const today = todayInKorea();
const from = process.argv[2] ?? `${Number(today.slice(0, 4)) - 1}-01-01`;
const to = process.argv[3] ?? today;

let count = 0;
const result = await backfillKofia(client, from, to, {
  today,
  onProgress: (date, status) => {
    count += 1;
    if (count % 50 === 0 || status === "waiting") console.log(`  ${date} ${status} (${count}번째)`);
  },
});
console.log(
  `국고채 금리 저장: ${result.saved}줄 / 자료 있는 날 ${result.tradingDays}일, 휴장일로 기록 ${result.holidays}일, 공시 전 ${result.waiting}일`,
);
if (result.rejected.length > 0) {
  console.log("검증에서 걸러진 값(미수집으로 둠):");
  for (const item of result.rejected) console.log(`  ${item.date} ${item.instrument} — ${item.reason}`);
}
