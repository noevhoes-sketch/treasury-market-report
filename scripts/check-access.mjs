// 허용 목록 확인 규칙이 맞는지 확인하는 스크립트 (CHECK.md 보안 높음 1번)
// 실행: npm run check:calc
import assert from "node:assert/strict";
import {
  LOGIN_NEUTRAL_MESSAGE,
  isManager,
  normalizeEmail,
  resolveAccess,
  safeNextPath,
  shouldSendLoginLink,
} from "../src/lib/auth/access.ts";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

// 확인용 가짜 허용 목록 (실제로는 allowed_users 표를 읽는다)
const table = [
  { id: 1, email: "manager@example.com", role: "manager" },
  { id: 2, email: "viewer@example.com", role: "viewer" },
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
await check("세션이 없으면 막는다 (조회도 하지 않는다)", async () => {
  lookups = 0;
  const result = await resolveAccess(undefined, lookup);
  assert.deepEqual(result, { ok: false, reason: "no-session" });
  assert.equal(lookups, 0);
});
await check("허용 목록에 있으면 목록의 역할로 들여보낸다", async () => {
  const result = await resolveAccess("Viewer@example.com", lookup);
  assert.equal(result.ok, true);
  assert.equal(result.user.role, "viewer");
  assert.equal(result.user.id, 2);
});
await check("허용 목록에 없는 사람은 로그인돼 있어도 막는다", async () => {
  const result = await resolveAccess("stranger@example.com", lookup);
  assert.deepEqual(result, { ok: false, reason: "not-allowed" });
});
await check("매 요청마다 목록을 다시 읽는다 (지운 사람은 바로 막힌다)", async () => {
  assert.equal((await resolveAccess("viewer@example.com", lookup)).ok, true);
  table.splice(1, 1); // 목록에서 열람자를 지운다
  assert.equal((await resolveAccess("viewer@example.com", lookup)).ok, false);
  table.push({ id: 2, email: "viewer@example.com", role: "viewer" });
});
await check("세션에 담당자라고 적혀 있어도 목록의 역할만 쓴다", async () => {
  // 세션 쪽에서 오는 값은 이메일 하나뿐이라, 역할을 속일 입력 자체가 없다.
  const result = await resolveAccess("viewer@example.com", lookup);
  assert.equal(isManager(result), false);
  assert.equal(isManager(await resolveAccess("manager@example.com", lookup)), true);
  assert.equal(isManager({ ok: false, reason: "no-session" }), false);
});
await check("조회 결과가 다른 이메일이면 막는다", async () => {
  const wrong = async () => ({ id: 9, email: "other@example.com", role: "manager" });
  const result = await resolveAccess("viewer@example.com", wrong);
  assert.equal(result.ok, false);
});
await check("로그인 링크는 목록에 있는 이메일에만 보낸다", async () => {
  assert.equal(await shouldSendLoginLink("manager@example.com", lookup), true);
  assert.equal(await shouldSendLoginLink("stranger@example.com", lookup), false);
  assert.equal(await shouldSendLoginLink("이메일아님", lookup), false);
});
await check("로그인 화면 문구는 하나뿐이다 (목록 포함 여부를 알려주지 않음)", () => {
  assert.equal(LOGIN_NEUTRAL_MESSAGE, "등록된 이메일이면 로그인 링크를 보냈습니다.");
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
