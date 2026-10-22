// 비밀번호 규칙 확인: 10자 이상, 이메일과 달라야 하고, 확인 입력이 같아야 한다. (실제 계정 없이 순수 함수만 시험한다)
// 실행: node --experimental-strip-types scripts/check-password.mjs
import { PASSWORD_MIN, validatePassword } from "../src/lib/auth/password-policy.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };
const email = "someone@example.com";

ok("좋은 비밀번호는 통과", validatePassword("blue-Sky-2026!", email, "blue-Sky-2026!").ok === true);
ok("확인 입력 없이도(담당자가 정할 때 등) 규칙만 보고 통과", validatePassword("blue-Sky-2026!", email).ok === true);
ok(`${PASSWORD_MIN}자 미만은 거부`, validatePassword("short-9ch", email).ok === false);
ok("딱 10자는 통과", validatePassword("abcdefghij", email).ok === true);
ok("빈 값·문자 아닌 값은 거부", validatePassword("", email).ok === false && validatePassword(undefined, email).ok === false && validatePassword(1234567890, email).ok === false);
ok("같은 글자만 반복하면 거부", validatePassword("aaaaaaaaaaaa", email).ok === false);
ok("공백만 있으면 거부", validatePassword("          ", email).ok === false);
ok("이메일과 같으면 거부(대소문자 무시)", validatePassword("Someone@Example.com", email).ok === false);
ok("이메일 앞부분(4자 이상)과 같으면 거부", validatePassword("someone-xx", "someone-xx@example.com").ok === false);
ok("확인 입력이 다르면 거부", validatePassword("blue-Sky-2026!", email, "blue-Sky-2026?").ok === false);
ok("72바이트를 넘으면 거부(한글은 글자당 3바이트)", validatePassword("가".repeat(25), email).ok === false);
ok("72바이트 이하 한글은 통과", validatePassword("가나다라마바사아자차카", email).ok === true);
const r = validatePassword("short", email);
ok("거부 이유는 한국어 문장으로 알려 준다", !r.ok && /[가-힣]/.test(r.message));
process.exit(failed ? 1 : 0);
