// 오늘 값을 지금 한 번 받아 저장한다. (자동 실행 주소가 하는 일과 같다. 손으로 확인할 때 쓴다)
// 실행: npm run collect:today
// 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { todayInKorea } from "../src/lib/calc/business-days.ts";
import { collectDaily } from "../src/lib/rates/collect-daily.ts";

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
console.log(JSON.stringify(await collectDaily(client, todayInKorea()), null, 2));
