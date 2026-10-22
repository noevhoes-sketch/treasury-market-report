// 로그인 문구 통일·시도 횟수 제한 확인: 등록 여부가 문구로 드러나지 않는지, 한도를 넘으면 막히는지 가짜 연결로 확인한다.
// 실행: node --experimental-strip-types scripts/check-login-policy.mjs
import { LOGIN_MESSAGES, replyToRequest, replyToUnapprovedLogin, MAX_ATTEMPTS_PER_EMAIL, MAX_ATTEMPTS_PER_IP } from "../src/lib/auth/login-policy.ts";
import { attemptBuckets, isRateLimited, recordAttempt } from "../src/lib/auth/rate-limit.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };

const a = replyToUnapprovedLogin("unknown"), b = replyToUnapprovedLogin("pending"), c = replyToUnapprovedLogin("rejected");
ok("로그인: 등록 안 됨·대기·거절이 완전히 같은 답", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c));
ok("로그인 답은 비밀번호 틀림과 미승인을 구분하지 않고, 가입 신청 안내가 들어 있다", replyToUnapprovedLogin().message === a.message && /가입 신청/.test(a.message));
ok("로그인 답 문구에 '미등록·대기·거절·승인되지 않은' 같은 상태 단어가 없다", !/미등록|등록되지|대기 중|거절|승인되지/.test(a.message));
const saved = replyToRequest("saved"), exists = replyToRequest("exists");
ok("신청: 새 이메일과 이미 있는 이메일의 답이 같다", JSON.stringify(saved) === JSON.stringify(exists));
ok("신청 답 문구에 '이미·거절·대기 중' 같은 상태 단어가 없다", !/이미|거절|대기 중|승인 대기/.test(saved.message));
ok("신청이 가득 찬 경우 문구에 '대기 중인 신청' 같은 내부 사정이 없다", !/대기 중인 신청/.test(replyToRequest("full").message));
ok("너무 많은 시도 문구가 따로 있다", LOGIN_MESSAGES.tooMany.includes("너무 많아요"));

// 메모리 가짜 연결
function fake() {
  const rows = [];
  let id = 0;
  return {
    rows,
    from() {
      const q = { f: [] };
      const api = {
        select() { return api; },
        eq(_c, v) { q.f.push((r) => r.bucket === v); return api; },
        gte(_c, v) { q.f.push((r) => r.created_at >= v); return api; },
        lt(_c, v) { q.f.push((r) => r.created_at < v); return api; },
        insert(list) { for (const x of list) rows.push({ id: ++id, bucket: x.bucket, created_at: new Date().toISOString(), ...x }); return Promise.resolve({ error: null }); },
        delete() { q.del = true; return api; },
        then(res) {
          const hit = rows.filter((r) => q.f.every((fn) => fn(r)));
          if (q.del) { for (const r of hit) rows.splice(rows.indexOf(r), 1); return res({ error: null }); }
          return res({ count: hit.length, error: null });
        },
      };
      return api;
    },
  };
}

let cl = fake();
for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL - 1; i++) await recordAttempt(cl, "a@b.kr", "1.1.1.1");
ok("한도 직전까지는 막지 않는다", (await isRateLimited(cl, "a@b.kr", "1.1.1.1")) === false);
await recordAttempt(cl, "a@b.kr", "1.1.1.1");
ok("같은 이메일이 한도를 넘으면 막는다", (await isRateLimited(cl, "a@b.kr", "9.9.9.9")) === true);
ok("다른 이메일은 영향이 없다", (await isRateLimited(cl, "other@b.kr", "9.9.9.9")) === false);

cl = fake();
for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) await recordAttempt(cl, `u${i}@b.kr`, "2.2.2.2");
ok("같은 접속 주소가 이메일을 바꿔 가며 시도해도 한도에서 막는다", (await isRateLimited(cl, "new@b.kr", "2.2.2.2")) === true);

cl = fake();
await recordAttempt(cl, "a@b.kr", "3.3.3.3");
const old = new Date(Date.now() - 11 * 60_000);
ok("10분이 지나면 세지 않는다", (await isRateLimited(cl, "a@b.kr", "3.3.3.3", new Date(old.getTime() + 22 * 60_000))) === false);
const bk = attemptBuckets("a@b.kr", "3.3.3.3");
ok("저장하는 값은 이메일·주소 원문이 아니라 해시", !JSON.stringify(cl.rows).includes("a@b.kr") && !JSON.stringify(cl.rows).includes("3.3.3.3") && /^email:[0-9a-f]{32}$/.test(bk.email));
process.exit(failed ? 1 : 0);
