// 담당자 화면의 "비밀번호 설정"이 실제로 동작하는지 확인한다(서버 함수를 화면 폼 그대로 보낸다).
// 실행: npm run check:password   (개발 서버를 켜 둔 상태에서. 시험용 사용자를 만들었다가 끝나면 지운다. 값은 출력하지 않는다)
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  }),
);
const BASE = "http://localhost:3000";
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) process.exitCode = 1; };

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

// 담당자로 로그인한 세션(스크립트 안에서만 쓰고 출력하지 않는다)
const manager = (await svc.from("allowed_users").select("id,email").eq("role", "manager").limit(1).single()).data;
const link = await svc.auth.admin.generateLink({ type: "magiclink", email: manager.email });
const jar = new Jar();
const confirm = await fetch(`${BASE}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=email`, { redirect: "manual" });
jar.add(confirm);

const E2E = "e2e-pw@example.com";
const createdUser = await svc.auth.admin.createUser({ email: E2E, password: "test-Pass-2026!", email_confirm: true });
await svc.from("allowed_users").insert({ email: E2E, role: "viewer", status: "approved", auth_user_id: createdUser.data.user.id });
let target;
try {
target = (await svc.from("allowed_users").select("id,email").eq("email", E2E).single()).data;
const page = await fetch(`${BASE}/review`, { headers: { cookie: jar.header() } });
const html = await page.text();
ok("담당자 확인 화면에 '비밀번호 설정' 구역과 승인된 사용자가 보인다", html.includes("비밀번호 설정") && html.includes("e2e-pw@example.com"));

// 그 사용자의 폼만 골라서 숨은 값(서버 함수 연결 값)을 그대로 가져온다
const forms = html.split("<form").slice(1).map((f) => f.split("</form>")[0]);
const form = forms.find((f) => new RegExp(`name="id"[^>]*value="${target.id}"`).test(f) || new RegExp(`value="${target.id}"[^>]*name="id"`).test(f));
ok("그 사용자의 비밀번호 폼을 찾았다", !!form);

function send(password, confirmPassword) {
  const fd = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const value = (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (name) fd.append(name, value);
  }
  fd.append("password", password);
  fd.append("passwordConfirm", confirmPassword);
  return fetch(`${BASE}/review`, { method: "POST", body: fd, headers: { cookie: jar.header() }, redirect: "manual" });
}

let res = await send("short", "short");
let body = await res.text();
ok("너무 짧은 비밀번호는 거부하고 이유를 알려 준다", body.includes("10자 이상"));
res = await send("new-Pass-2027!", "different-Pass-1!");
body = await res.text();
ok("확인 입력이 다르면 거부", body.includes("확인이 맞지 않아요"));
const before = await anon.auth.signInWithPassword({ email: target.email, password: "test-Pass-2026!" });
ok("거부된 요청은 기존 비밀번호를 바꾸지 않는다", !before.error);
res = await send("new-Pass-2027!", "new-Pass-2027!");
body = await res.text();
ok("올바른 요청은 '새로 정했어요'로 끝난다", body.includes("비밀번호를 새로 정했어요"));
const oldTry = await anon.auth.signInWithPassword({ email: target.email, password: "test-Pass-2026!" });
const newTry = await anon.auth.signInWithPassword({ email: target.email, password: "new-Pass-2027!" });
ok("이전 비밀번호는 더 이상 안 되고, 새 비밀번호로 로그인된다", !!oldTry.error && !newTry.error);

// 로그인하지 않은 사람이 같은 폼을 보내면 반영되지 않는다
const noJar = new Jar();
const fd = new FormData();
for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
  const name = /name="([^"]*)"/.exec(m[0])?.[1];
  const value = (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  if (name) fd.append(name, value);
}
fd.append("password", "hacker-Pass-2028!");
fd.append("passwordConfirm", "hacker-Pass-2028!");
await fetch(`${BASE}/review`, { method: "POST", body: fd, headers: { cookie: noJar.header() }, redirect: "manual" });
const hacked = await anon.auth.signInWithPassword({ email: target.email, password: "hacker-Pass-2028!" });
ok("로그인하지 않은 사람이 보낸 비밀번호 설정은 반영되지 않는다", !!hacked.error);
} finally {
  // 정리: 중간에 오류가 나도 시험용 사용자가 남지 않게 한다.
  await svc.from("allowed_users").delete().eq("email", E2E);
  await svc.auth.admin.deleteUser(createdUser.data.user.id);
  console.log("정리: 시험용 사용자 삭제");
}
