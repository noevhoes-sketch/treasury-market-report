// 담당자 확인 코드를 새로 만들어 .env의 MANAGER_LOGIN_CODE에 저장한다. (코드 값은 화면에 출력하지 않는다)
// 실행: npm run rotate:manager-code
// 새 코드는 .env 파일을 열어 MANAGER_LOGIN_CODE 줄에서 직접 확인한다. 담당자들에게는 안전한 방법으로 전달한다.
// 배포하는 곳(Vercel 환경변수)에도 같은 값을 넣어야 한다.
import fs from "node:fs";
import { generateManagerCode } from "../src/lib/auth/manager-code.ts";

const code = generateManagerCode();
let text = fs.readFileSync(".env", "utf8");
const line = `MANAGER_LOGIN_CODE=${code}`;

if (/^MANAGER_LOGIN_CODE=.*$/m.test(text)) {
  text = text.replace(/^MANAGER_LOGIN_CODE=.*$/m, line);
} else {
  text = text.replace(/\s*$/, "\n") + line + "\n";
}
fs.writeFileSync(".env", text);
console.log("새 담당자 확인 코드를 .env의 MANAGER_LOGIN_CODE에 저장했어요. (값은 출력하지 않아요)");
