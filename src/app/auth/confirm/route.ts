// Design Ref: §2.5 로그인 — 다른 브라우저·기기에서 열어도 되는 확인 주소(token_hash 방식)
// 메일 양식을 바꿀 수 있는 환경(사용자 지정 메일 서버)에서 이 주소를 링크로 쓴다.
import { createSessionClient } from "@/lib/auth/session";
import { finishLogin, loginFailed } from "../finish";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  // 이메일 로그인 링크(magiclink/email)만 받는다.
  if (!tokenHash || (type !== "email" && type !== "magiclink")) {
    return loginFailed(url);
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "magiclink" ? "magiclink" : "email",
  });
  if (error) return loginFailed(url);

  return finishLogin(url, url.searchParams.get("next"));
}
