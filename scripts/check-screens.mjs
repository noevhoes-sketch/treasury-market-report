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
const TEST_DATE = "2031-03-05"; // 진짜 보고서 날짜와 겹치면 시험이 끝날 때 지워 버리므로 먼 미래 날짜를 쓴다
const CAUSE = "시험용 원인 문장 ABC";
const CONFIRMED_DATE = "2031-03-04";
const CONFIRMED_CAUSE = "시험용 확정 문장 XYZ";

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
  await svc.from("allowed_users").insert([{ email: users.manager, role: "manager", status: "approved" }, { email: users.viewer, role: "viewer", status: "approved" }]);
  const managerRow = await svc.from("allowed_users").select("id").eq("email", users.manager).single();
  await svc.from("reports").upsert({ report_date: CONFIRMED_DATE, table_status: "done", cause_kr: CONFIRMED_CAUSE, cause_status_kr: "draft", source_url_kr: "https://news.einfomax.co.kr/news/articleView.html?idxno=4440425", confirmed_by: managerRow.data.id, confirmed_at: new Date().toISOString() }, { onConflict: "report_date" });
  await svc.from("reports").upsert({ report_date: TEST_DATE, table_status: "done", cause_kr: CAUSE, cause_status_kr: "draft" }, { onConflict: "report_date" });

  // 로그인 전
  let r = await get("/reports/2026-10-21", new Jar());
  let html;
  ok("로그인 전 보고서 화면은 로그인 화면으로 보낸다", r.status >= 300 && r.status < 400 && r.headers.get("location").includes("/login"), `${r.status}`);
  r = await get("/logo.svg", new Jar());
  ok("로고 그림 파일은 로그인 전에도 열린다(로그인 화면에 보여야 한다)", r.status === 200 && (r.headers.get("content-type") ?? "").includes("svg"), `${r.status}`);
  r = await get("/login", new Jar());
  html = await r.text();
  ok("로그인 화면 맨 위에 로고가 있고 누르면 홈(/)으로 간다", /<a[^>]*href="\/"[^>]*>[\s\S]*?logo\.svg/.test(html) && html.includes("재정경제부"));
  r = await get("/reports", new Jar());
  ok("로그인 전 목록도 막는다", r.status >= 300 && r.status < 400);

  // 담당자
  const manager = await login(users.manager);
  r = await get("/reports/2026-10-21", manager);
  html = await r.text();
  ok("담당자: 보고서 화면에 제목·금리·변동폭이 보인다", r.status === 200 && html.includes("10/21(수) 국채시장 동향") && html.includes("3.822") && html.includes("△1.8bp"));
  ok("금리 추이 그래프(선 3개, 전월말 점선 기준)가 보인다", html.includes("국고채 금리 추이") && (html.match(/<path d=\"M/g) ?? []).length === 3 && html.includes("전월말 9/30"));
  ok("불러오는 동안 보이는 자리 표시(스켈레톤)가 화면에 함께 실려 온다", html.includes("불러오는 중입니다") && html.includes("animate-pulse"));
  ok("전일비 글자색: 하락(10/21 전 종목 하락)은 파랑", html.includes("text-[#1d5fd1]") && !html.includes("text-[#c62828]"));
  ok("담당자: 출처와 열별 기준일이 보인다", html.includes("금융투자협회") && html.includes("미국 재무부") && html.includes("전월말 9/30"));
  ok("로그인 후 모든 화면 맨 위에도 로고가 있고 누르면 홈(/)으로 간다", /<header[^>]*sticky[\s\S]*?<a[^>]*href="\/"[^>]*>[\s\S]*?logo\.svg/.test(html));
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
  ok("맨 위 메뉴 이름: 금일 동향 · 일자별 동향", html.includes("금일 동향") && html.includes("일자별 동향") && !html.includes("오늘 보고서") && !html.includes("지난 보고서"));
  ok("담당자: 일자별 동향 목록이 열린다", r.status === 200 && html.includes("국채시장 동향") && html.includes("10/21(수)"));
  r = await get(`/reports/${TEST_DATE}`, manager);
  html = await r.text();
  ok("담당자: 확정 전 원인 초안이 보인다", html.includes(CAUSE));
  r = await get("/review", manager);
  html = await r.text();
  ok("담당자: 확인 화면이 열린다", r.status === 200 && html.includes("담당자 확인"));

  // 열람자
  r = await get(`/review/${TEST_DATE}`, manager);
  html = await r.text();
  ok("담당자: 원인 확인·확정 화면에 초안 문장과 근거 기사 링크가 보인다", html.includes(CAUSE) && html.includes("초안, 담당자 확인 필요"));
  r = await get("/review/2026-13-45", manager);
  html = await r.text();
  ok("담당자: 이상한 날짜의 확인 화면은 없는 페이지로 처리", /NEXT_HTTP_ERROR_FALLBACK;404|could not be found/.test(html) && !html.includes("저장"));
  const viewer = await login(users.viewer);
  r = await get("/reports/2026-10-21", viewer);
  html = await r.text();
  ok("열람자: 금리 표는 보인다", r.status === 200 && html.includes("3.822"));
  r = await get(`/reports/${TEST_DATE}`, viewer);
  html = await r.text();
  ok("열람자: 확정 전 원인 문장은 보이지 않고 '작성 중'만 보인다", !html.includes(CAUSE) && html.includes("작성 중"));
  r = await get(`/reports/${CONFIRMED_DATE}`, viewer);
  html = await r.text();
  ok("열람자: 확정된 원인 문장과 근거 기사 링크가 보인다", html.includes(CONFIRMED_CAUSE) && html.includes("근거 기사") && html.includes("idxno=4440425"));
  r = await get(`/review/${TEST_DATE}`, viewer);
  html = await r.text();
  ok("열람자: 원인 확인·확정 화면의 내용은 보이지 않는다(이동 신호만)", !html.includes(CAUSE) && !html.includes("저장"));
  r = await get("/review", viewer);
  html = await r.text();
  ok("열람자: 담당자 확인 화면의 내용은 보이지 않는다(이동 신호만)", !html.includes("그대로 올리기") && !html.includes("확인할 값이 없습니다") && /NEXT_REDIRECT|\/"/.test(html) || r.status >= 300);
  r = await get("/reports/2026-10-21", viewer);
  html = await r.text();
  ok("열람자: '담당자 확인' 메뉴가 보이지 않는다", !html.includes("담당자 확인"));

  // 한글 파일 내려받기
  r = await get(`/api/reports/${CONFIRMED_DATE}/hwpx`, new Jar());
  ok("한글 파일: 로그인 전에는 받을 수 없다", r.status >= 300 && r.status < 400, `${r.status}`);
  r = await get(`/api/reports/${TEST_DATE}/hwpx`, manager);
  ok("한글 파일: 확정 전 보고서는 거절(409)", r.status === 409, `${r.status}`);
  r = await get(`/api/reports/${CONFIRMED_DATE}/hwpx`, viewer);
  ok("한글 파일: 열람자는 받을 수 없다(403)", r.status === 403, `${r.status}`);
  r = await get(`/api/reports/${CONFIRMED_DATE}/hwpx`, manager);
  const bytes = new Uint8Array(await r.arrayBuffer());
  ok("한글 파일: 확정된 보고서는 담당자가 받는다(zip, 첫 파일 mimetype)", r.status === 200 && bytes[0] === 0x50 && bytes[1] === 0x4b && new TextDecoder().decode(bytes.subarray(30, 38)) === "mimetype", `${r.status} ${bytes.length}B`);
  ok("한글 파일: 확정한 원인 문장이 들어있다", new TextDecoder().decode(bytes).includes(CONFIRMED_CAUSE));
  r = await get("/api/reports/2026-13-45/hwpx", manager);
  ok("한글 파일: 이상한 날짜는 404", r.status === 404, `${r.status}`);
  r = await get("/reports/" + CONFIRMED_DATE, manager);
  html = await r.text();
  ok("담당자에게는 확정된 보고서에 [한글 파일 내려받기]가 보인다", html.includes("한글 파일(.hwpx) 내려받기"));
  r = await get("/reports/" + CONFIRMED_DATE, viewer);
  html = await r.text();
  ok("열람자에게는 [한글 파일 내려받기]가 보이지 않는다", !html.includes("한글 파일(.hwpx)"));
  r = await get(`/review/${TEST_DATE}`, manager);
  html = await r.text();
  ok("담당자 확인 화면에 금리 직접 입력이 보인다", html.includes("금리 직접 입력"));

  // 자동 실행 잠금
  r = await get("/api/cron/collect", new Jar());
  ok("자동 실행 주소: 비밀 값 없이 부르면 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", new Jar(), { headers: { authorization: "Bearer wrong-secret" } });
  ok("자동 실행 주소: 틀린 비밀 값은 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/cause", new Jar());
  ok("원인 자동 실행 주소: 비밀 값 없이 부르면 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/cause", new Jar(), { headers: { authorization: "Bearer wrong-secret" } });
  ok("원인 자동 실행 주소: 틀린 비밀 값은 거부(401)", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", viewer, { headers: { authorization: "Bearer " } });
  ok("자동 실행 주소: 로그인한 사람이라도 비밀 값이 없으면 거부", r.status === 401, `${r.status}`);
  r = await get("/api/cron/collect", new Jar(), { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  const body = await r.json().catch(() => ({}));
  ok("자동 실행 주소: 맞는 비밀 값이면 일하고 결과를 돌려준다", r.status === 200 && typeof body.date === "string" && ["ok", "waiting", "no-data"].includes(body.kr), `${r.status} ${body.kr ?? ""}`);
} finally {
  await svc.from("reports").delete().eq("report_date", TEST_DATE).eq("cause_kr", CAUSE);
  await svc.from("reports").delete().eq("report_date", CONFIRMED_DATE).eq("cause_kr", CONFIRMED_CAUSE);
  await svc.from("allowed_users").delete().in("email", Object.values(users));
  const list = await svc.auth.admin.listUsers();
  for (const u of list.data.users) if (Object.values(users).includes(u.email)) await svc.auth.admin.deleteUser(u.id);
  const left = await svc.from("allowed_users").select("email");
  console.log(`정리: 허용 목록 ${left.data.length}행(실제 담당자 포함)`);
}
