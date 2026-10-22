// Design Ref: §2.5 로그인 — 메일 링크를 누르면 도착하는 곳(같은 브라우저에서 요청한 링크)
import { createSessionClient } from "@/lib/auth/session";
import { finishLogin, loginFailed } from "../finish";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return loginFailed(url);

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginFailed(url);

  return finishLogin(url, url.searchParams.get("next"));
}
