// 로그인 흐름 확인: 개발 서버(npm run dev)를 켜 둔 상태에서 실제 서버와 Supabase로 확인한다.
// 실행: npm run check:login   (시험용 계정을 만들었다가 끝나면 모두 지운다. 비밀 값은 출력하지 않는다)
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync(".env","utf8").split(/\r?\n/).filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)];}));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const BASE = "http://localhost:3000";
class Jar { c = new Map(); add(res){ for (const s of res.headers.getSetCookie?.() ?? []) { const [kv] = s.split(";"); const i = kv.indexOf("="); const k = kv.slice(0,i), v = kv.slice(i+1); if (/max-age=0|expires=thu, 01 jan 1970/i.test(s) || v === "") this.c.delete(k); else this.c.set(k,v);} } header(){ return [...this.c].map(([k,v])=>`${k}=${v}`).join("; "); } }
async function get(path, jar, init={}) { const res = await fetch(BASE+path,{redirect:"manual",headers:{cookie:jar.header()},...init}); jar.add(res); return res; }
const loc = (r) => r.headers.get("location");
const ok = (name, cond, extra="") => console.log(`${cond?"✅":"❌"} ${name}${extra?" — "+extra:""}`);

const users = {manager:"e2e-manager@example.com", stranger:"e2e-stranger@example.com"};
for (const e of Object.values(users)) { const r = await svc.auth.admin.createUser({email:e,email_confirm:true}); if (r.error && !/already/i.test(r.error.message)) console.log("createUser 오류", r.error.message); }
await svc.from("allowed_users").insert({email:users.manager, role:"manager"});

async function link(email){ const r = await svc.auth.admin.generateLink({type:"magiclink",email}); return r.data.properties.hashed_token; }

// 1. 로그인 전
let jar = new Jar();
let r = await get("/", jar); ok("로그인 전 첫 화면은 로그인 화면으로 보낸다", r.status>=300 && r.status<400 && loc(r).includes("/login"), `${r.status}`);
r = await get("/login", jar); const html = await r.text(); ok("로그인 화면이 열린다", r.status===200 && html.includes("로그인 링크 받기") && html.includes("국채시장 동향"));
r = await get("/auth/confirm?token_hash=bad&type=email", jar); ok("엉터리 링크는 실패 처리", loc(r)?.includes("/login?error=1"), loc(r));
r = await get("/auth/callback", jar); ok("code 없는 callback은 실패 처리", loc(r)?.includes("/login?error=1"));

// 2. 허용된 담당자
jar = new Jar();
r = await get(`/auth/confirm?token_hash=${await link(users.manager)}&type=email`, jar);
ok("허용된 이메일은 링크로 로그인된다", r.status>=300 && r.status<400 && new URL(loc(r),BASE).pathname==="/", `${r.status} → ${loc(r)}`);
r = await get("/", jar); let page = await r.text();
ok("로그인 후 첫 화면에 이메일과 역할이 보인다", r.status===200 && page.includes(users.manager) && page.includes("담당자"));

// 3. 허용 목록에서 지우면 세션이 있어도 다음 요청부터 막힌다
await svc.from("allowed_users").delete().eq("email", users.manager);
r = await get("/", jar); { const body = await r.text(); ok("목록에서 지운 사람은 로그인 세션이 있어도 내용을 볼 수 없다(이동 신호만 받는다)", !body.includes(users.manager) && !/담당자|열람자/.test(body) && /NEXT_REDIRECT|login/.test(body), `${r.status}`); }
await svc.from("allowed_users").insert({email:users.manager, role:"viewer"});
r = await get("/", jar); page = await r.text(); ok("역할은 허용 목록에서만 읽는다(담당자→열람자로 바꾸면 바로 반영)", r.status===200 && page.includes("열람자"));

// 4. 로그아웃
r = await get("/auth/signout",jar,{method:"POST"}); ok("로그아웃은 로그인 화면으로", r.status===303 && loc(r).endsWith("/login"), `${r.status}`);
r = await get("/", jar); ok("로그아웃 뒤에는 다시 막힌다", r.status>=300 && r.status<400 && loc(r).includes("/login"));

// 5. 계정은 있지만 허용 목록에 없는 사람
jar = new Jar();
r = await get(`/auth/confirm?token_hash=${await link(users.stranger)}&type=email`, jar);
ok("허용 목록에 없는 사람은 링크가 맞아도 로그인 실패", loc(r)?.includes("/login?error=1"), loc(r));
r = await get("/", jar); ok("그 사람은 세션이 남지 않아 첫 화면도 막힌다", r.status>=300 && r.status<400 && loc(r).includes("/login"));

// 6. 돌아갈 주소 조작
jar = new Jar();
r = await get(`/auth/confirm?token_hash=${await link(users.manager)}&type=email&next=//evil.com`, jar);
ok("다른 사이트로 보내는 next는 무시하고 우리 첫 화면으로", new URL(loc(r),BASE).origin===BASE && !loc(r).includes("evil"), loc(r));

// 정리
await svc.from("allowed_users").delete().eq("email", users.manager);
const list = await svc.auth.admin.listUsers(); for (const u of list.data.users) if (Object.values(users).includes(u.email)) await svc.auth.admin.deleteUser(u.id);
const left = await svc.from("allowed_users").select("id"); const after = (await svc.auth.admin.listUsers()).data.users.length;
console.log(`정리: 허용 목록 ${left.data.length}행, 로그인 계정 ${after}개`);
