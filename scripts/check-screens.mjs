// 보고서 화면·접근 권한·자동 실행 잠금 확인: 개발 서버(npm run dev)를 켜 둔 상태에서 실제 서버와 Supabase로 확인한다.
// 실행: npm run check:screens
// 시험용 계정(담당자·열람자)과 시험용 보고서 한 줄을 만들었다가 끝나면 모두 지운다. 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3000";
const TEST_DATE = "2026-10-20";
const CAUSE = "시험용 원인 문장 ABC";

class Jar {
  c = new Map();
  add(res) {
    for (const s of res.headers.getSetCookie?.() ?? []) {
      const [kv] = s.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0/i.test(s) || v === "") this.c.delete(k); else this.c.set(k, v);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
}
async function get(path, jar, init = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: jar.header(), ...(init.headers ?? {}) }, method: init.method ?? "GET" });
  jar.add(res);
  return res;
}
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); if (!cond) process.exitCode = 1; };
const users = { manager: "e2e-screen-manager@example.com", viewer: "e2e-screen-viewer@example.com" };

async function login(email) {
  const jar = new Jar();
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email });
  await get(`/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=email`, jar);
  return jar;
}

try {
  for (const email of Object.values(users)) await svc.auth.admin.createUser({ email, email_confirm: true });
  await svc.from("allowed_users").insert([{ email: users.manager, role: "manager" }, { email: users.viewer, role: "viewer" }]);
  await svc.from("reports").upsert({ report_date: TEST_DATE, table_status: "done", cause_kr: CAUSE, cause_status_kr: "draft" }, { onConflict: "report_date" });

  // 로그인 전
  let r = await get("/reports/2026-10-21", new Jar());
  ok("로그인 전 보고서 화면은 로그인 화면으로 보낸다", r.status >= 300 && r.status < 400 && r.headers.get("location").includes("/login"), `${r.status}`);
  r = await get("/reports", new Jar());
  ok("로그인 전 목록도 막는다", r.status >= 300 && r.status < 400);

  // 담당자
  const manager = await login(users.manager);
  r = await get("/reports/2026-10-21", manager);
  let html = await r.text();
  ok("담당자: 보고서 화면에 제목·금리·변동폭이 보인다", r.status === 200 && html.includes("10/21(수) 국채시장 동향") && html.includes("3.822") && html.includes("-1.8bp"));
  ok("담당자: 출처와 열별 기준일이 보인다", html.includes("금융투자협회") && html.includes("미국 재무부") && html.includes("전월말 9/30"));
  r = await get("/reports/2026-13-45", manager);
  html = await r.text();
  // 화면을 먼저 내보내기 시작한 뒤에 "없는 페이지"로 바뀌므로 상태 코드는 200이지만, 표 내용은 나가지 않는다.
  ok("이상한 날짜 주소는 보고서 대신 \"없는 페이지\"로 처리하고 표를 보여주지 않는다", /NEXT_HTTP_ERROR_FALLBACK;404|could not be found/.test(html) && !html.includes("금리 표"), `${r.status}`);
  r = await get("/reports/abc%3Cscript%3E", manager);
  html = await r.text();
  ok("날짜 주소에 스크립트를 넣어도 실행 가능한 형태로 나오지 않는다", !html.includes("<script>abc") && !html.includes("금리 표"));
  r = await get("/reports/2026-10-24", manager);
  html = await r.text();
  ok("휴장일(토요일)은 보고서 없음 안내", r.status === 200 && html.includes("휴장일이라 보고서가 없습니다"));
  r = await get("/reports", manager);
  html = await r.text();
  ok("담당자: 지난 보고서 목록이 열린다", r.status === 200 && html.includes("국채시장 동향") && html.includes("10/21(수)"));
  r = await get(`/reports/${TEST_DATE}`, manager);
  html = await r.text();
  ok("담당자: 확정 전 원인 초안이 보인다", html.includes(CAUSE));
  r = await get("/review", manager);
  html = await r.text();
  ok("담당자: 확인 화면이 열린다", r.status === 200 && html.includes("담당자 확인"));

  // 열람자
  const viewer = await login(users.viewer);
  r = await get("/reports/2026-10-21", viewer);
  html = await r.text();
  ok("열람자: 금리 표는 보인다", r.status === 200 && html.includes("3.822"));
  r = await get(`/reports/${TEST_DATE}`, viewer);
  html = await r.text();
  ok("열람자: 확정 전 원인 문장은 보이지 않고 '작성 중'만 보인다", !html.includes(CAUSE) && html.includes("작성 중"));
  r = await get("/review", viewer);
  html = await r.text();
  ok("열람자: 담당자 확인 화면의 내용은 보이지 않는다(이동 신호만)", !html.includes("그대로 올리기") && !html.includes("확인할 값이 없습니다") && /NEXT_REDIRECT|\/"/.test(html) || r.status >= 300);
  r = await get("/reports/2026-10-21", viewer);
  html = await r.text();
  ok("열람자: '담당자 확인' 메뉴가 보이지 않는다", !html.includes("담당자 확인"));

  // 자동 실행 잠금
  r = await get("/api/cron/collect", new Jar());
  ok("자동 실행 주소: 비밀 값 없이 부르면 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", new Jar(), { headers: { authorization: "Bearer wrong-secret" } });
  ok("자동 실행 주소: 틀린 비밀 값은 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", viewer, { headers: { authorization: "Bearer " } });
  ok("자동 실행 주소: 로그인한 사람이라도 비밀 값이 없으면 거부", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", new Jar(), { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  const body = await r.json().catch(() => ({}));
  ok("자동 실행 주소: 맞는 비밀 값이면 일하고 결과를 돌려준다", r.status === 200 && typeof body.date === "string" && ["ok", "waiting", "no-data"].includes(body.kr), `${r.status} ${body.kr ?? ""}`);
} finally {
  await svc.from("reports").delete().eq("report_date", TEST_DATE).eq("cause_kr", CAUSE);
  await svc.from("allowed_users").delete().in("email", Object.values(users));
  const list = await svc.auth.admin.listUsers();
  for (const u of list.data.users) if (Object.values(users).includes(u.email)) await svc.auth.admin.deleteUser(u.id);
  const left = await svc.from("allowed_users").select("email");
  console.log(`정리: 허용 목록 ${left.data.length}행(실제 담당자 포함)`);
}
