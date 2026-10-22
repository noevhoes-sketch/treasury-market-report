// 이메일 + 비밀번호 로그인 계정을 만들거나, 비밀번호를 새로 정한다. (담당자 첫 비밀번호·심사용 계정을 만들 때 쓴다)
// 실행: npm run set:password -- 이메일 [manager|viewer]
//   - 이미 허용 목록에 있는 이메일이면 비밀번호만 새로 정한다.
//   - 목록에 없으면 "승인됨" 상태로 새로 만든다(역할 기본값 viewer = 열람자).
// 비밀번호는 터미널에서 직접 입력한다(화면에 보이지 않고, 채팅이나 파일에 남지 않는다).
// 시험용으로만 NEW_PASSWORD 환경 변수를 쓸 수 있다. 비밀 값은 출력하지 않는다.
import fs from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail } from "../src/lib/auth/access.ts";
import { validatePassword } from "../src/lib/auth/password-policy.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  }),
);
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const admin = client.auth.admin;

const email = normalizeEmail(process.argv[2]);
const role = process.argv[3] === "manager" ? "manager" : "viewer";
if (!email) {
  console.error("사용법: npm run set:password -- 이메일 [manager|viewer]");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    // 입력하는 글자는 화면에 보이지 않게 한다(질문 문구를 쓴 다음에 켠다).
    rl._writeToOutput = () => {};
  });
}

let password = process.env.NEW_PASSWORD ?? "";
let confirm = password;
if (!password) {
  password = await askHidden("새 비밀번호(10자 이상): ");
  confirm = await askHidden("새 비밀번호 확인: ");
}
const check = validatePassword(password, email, confirm);
if (!check.ok) {
  console.error("❌", check.message);
  process.exit(1);
}

async function findAuthUserId() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

const row = await client.from("allowed_users").select("id, role, status, auth_user_id").eq("email", email).maybeSingle();
if (row.error) throw new Error(row.error.message);

let authId = row.data?.auth_user_id ?? (await findAuthUserId());
if (authId) {
  const updated = await admin.updateUserById(authId, { password, email_confirm: true });
  if (updated.error) throw new Error(updated.error.message);
} else {
  const created = await admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  authId = created.data.user.id;
}

if (row.data) {
  await client.from("allowed_users").update({ auth_user_id: authId }).eq("id", row.data.id);
  console.log(`✅ ${email}: 비밀번호를 새로 정했어요 (역할 ${row.data.role}, 상태 ${row.data.status}).`);
  if (row.data.status !== "approved") console.log("⚠ 아직 승인되지 않았어요. 담당자 확인 화면에서 승인해야 로그인돼요.");
} else {
  const inserted = await client.from("allowed_users").insert({ email, role, status: "approved", auth_user_id: authId });
  if (inserted.error) throw new Error(inserted.error.message);
  console.log(`✅ ${email}: 새 계정을 만들고 승인했어요 (역할 ${role}).`);
}
