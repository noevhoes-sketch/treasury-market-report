// 미국 10년 금리를 미국 재무부에서 받아 데이터베이스에 저장한다. (Plan 작업 5·7: 시작값 채우기)
// 실행: npm run seed:us          (올해와 지난해)
//       npm run seed:us -- 2024  (원하는 연도만)
// 여러 번 실행해도 같은 값이면 결과가 같다. 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { collectUsTenYear } from "../src/lib/rates/collect-us.ts";

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

const thisYear = new Date().getFullYear();
const years = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [thisYear - 1, thisYear];

const result = await collectUsTenYear(client, years);
console.log(`미국 10년 금리 저장: ${result.saved}줄 (건너뜀 ${result.skipped}줄), 가장 최근 자료 ${result.latestDate}`);
