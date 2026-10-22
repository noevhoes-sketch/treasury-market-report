// 허용 목록 확인 규칙(신청 → 승인 → 이메일만으로 로그인)이 맞는지 확인하는 스크립트 (CHECK.md 보안 높음 1번)
// 실행: npm run check:calc
import assert from "node:assert/strict";
import {
  decideLogin,
  isManager,
  normalizeEmail,
  resolveAccess,
  safeNextPath,
} from "../src/lib/auth/access.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

// 확인용 가짜 허용 목록 (실제로는 allowed_users 표를 읽는다)
const table = [
  { id: 1, email: "manager@example.com", role: "manager", status: "approved" },
  { id: 2, email: "viewer@example.com", role: "viewer", status: "approved" },
  { id: 3, email: "waiting@example.com", role: "viewer", status: "pending" },
  { id: 4, email: "refused@example.com", role: "viewer", status: "rejected" },
];
let lookups = 0;
const lookup = async (email) => {
  lookups += 1;
  return table.find((row) => row.email === email) ?? null;
};

await check("이메일은 공백·대문자를 다듬어 비교한다", () => {
  assert.equal(normalizeEmail("  Manager@Example.COM "), "manager@example.com");
});
await check("이메일 모양이 아니면 null", () => {
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("abc"), null);
  assert.equal(normalizeEmail("a b@c.com"), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail({ email: "a@b.c" }), null);
});
await check("로그인 창 판단: 승인·대기·거절·미등록을 구분한다", () => {
  assert.equal(decideLogin({ status: "approved" }), "approved");
  assert.equal(decideLogin({ status: "pending" }), "pending");
  assert.equal(decideLogin({ status: "rejected" }), "rejected");
  assert.equal(decideLogin(null), "unknown");
});
await check("세션이 없으면 막는다 (조회도 하지 않는다)", async () => {
  lookups = 0;
  const result = await resolveAccess(undefined, lookup);
  assert.deepEqual(result, { ok: false, reason: "no-session" });
  assert.equal(lookups, 0);
});
await check("승인된 사람은 목록의 역할로 들여보낸다", async () => {
  const result = await resolveAccess("Viewer@example.com", lookup);
  assert.equal(result.ok, true);
  assert.equal(result.user.role, "viewer");
  assert.equal(result.user.id, 2);
});
await check("승인 대기·거절된 사람은 계정과 세션이 있어도 막는다", async () => {
  assert.deepEqual(await resolveAccess("waiting@example.com", lookup), { ok: false, reason: "not-allowed" });
  assert.deepEqual(await resolveAccess("refused@example.com", lookup), { ok: false, reason: "not-allowed" });
});
await check("허용 목록에 없는 사람은 로그인돼 있어도 막는다", async () => {
  const result = await resolveAccess("stranger@example.com", lookup);
  assert.deepEqual(result, { ok: false, reason: "not-allowed" });
});
await check("매 요청마다 목록을 다시 읽는다 (지우거나 거절로 바꾸면 바로 막힌다)", async () => {
  assert.equal((await resolveAccess("viewer@example.com", lookup)).ok, true);
  table[1].status = "rejected";
  assert.equal((await resolveAccess("viewer@example.com", lookup)).ok, false);
  table[1].status = "approved";
  table.splice(1, 1);
  assert.equal((await resolveAccess("viewer@example.com", lookup)).ok, false);
  table.splice(1, 0, { id: 2, email: "viewer@example.com", role: "viewer", status: "approved" });
});
await check("승인 대기였던 사람이 승인되면 그다음 요청부터 들어온다", async () => {
  assert.equal((await resolveAccess("waiting@example.com", lookup)).ok, false);
  table[2].status = "approved";
  assert.equal((await resolveAccess("waiting@example.com", lookup)).ok, true);
  table[2].status = "pending";
});
await check("역할은 목록에서만 읽는다 (담당자 여부 판단)", async () => {
  assert.equal(isManager(await resolveAccess("viewer@example.com", lookup)), false);
  assert.equal(isManager(await resolveAccess("manager@example.com", lookup)), true);
  assert.equal(isManager({ ok: false, reason: "no-session" }), false);
});
await check("조회 결과가 다른 이메일이면 막는다", async () => {
  const wrong = async () => ({ id: 9, email: "other@example.com", role: "manager", status: "approved" });
  const result = await resolveAccess("viewer@example.com", wrong);
  assert.equal(result.ok, false);
});
await check("돌아갈 주소: 우리 사이트 안만 허용", () => {
  assert.equal(safeNextPath("/reports/2026-10-22"), "/reports/2026-10-22");
  assert.equal(safeNextPath("/"), "/");
});
await check("돌아갈 주소: 다른 사이트로 보내는 값은 첫 화면으로", () => {
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("javascript:alert(1)"), "/");
  assert.equal(safeNextPath("/ok\nSet-Cookie: x"), "/");
  assert.equal(safeNextPath(undefined), "/");
});
console.log(`\n모두 통과: ${passed}개`);
