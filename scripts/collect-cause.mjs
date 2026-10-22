// 원인 초안을 지금 한 번 만든다. (자동 실행 주소가 하는 일과 같다. 손으로 확인할 때 쓴다)
// 실행: npm run collect:cause              (오늘 날짜)
//       npm run collect:cause -- 2026-10-21  (원하는 날짜. 목록에 남아 있는 최근 기사만 찾을 수 있다)
// 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { todayInKorea } from "../src/lib/calc/business-days.ts";
import { generateCauseDraft } from "../src/lib/cause/collect-cause.ts";

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
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const date = process.argv[2] ?? todayInKorea();
console.log(
  JSON.stringify(
    await generateCauseDraft(client, date, { apiKey: env.OPENAI_API_KEY ?? "", model: env.OPENAI_MODEL || undefined }),
    null,
    2,
  ),
);
