"use server";

// Design Ref: §1.1 로그인 화면, §2.5 로그인 — 가입 신청 → 담당자 승인 → 이메일 + 비밀번호로 로그인
//
// 비밀번호는 로그인 서비스(Supabase)가 암호화해서 보관하고, 이 앱은 원문을 저장하지 않는다.
// 승인된 사람이 비밀번호까지 맞아야만 세션을 만든다. 승인 전이거나 비밀번호가 틀리면 같은 문구로 답한다.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { decideLogin, normalizeEmail } from "@/lib/auth/access";
import { LOGIN_MESSAGES, replyToRequest, replyToUnapprovedLogin } from "@/lib/auth/login-policy";
import { validatePassword } from "@/lib/auth/password-policy";
import { isRateLimited, recordAttempt } from "@/lib/auth/rate-limit";
import { createSessionClient, getAccess } from "@/lib/auth/session";
import { createSignupRequest } from "@/lib/db/auth-users";
import { lookupAllowedUser } from "@/lib/db/allowed-users";
import { createServiceClient } from "@/lib/db/server";

export type LoginFormState = {
  message: string | null;
};

/** 접속 주소: Vercel이 붙여 주는 x-forwarded-for의 첫 값. 없으면 "unknown". */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** 폼에서 온 글을 문자열로. 너무 긴 글은 검사 전에 잘라 낸다(비밀번호는 규칙 검사에서 길이로 걸러진다). */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 200) : "";
}

/**
 * 로그인 창의 [로그인]·[가입 신청] 두 버튼이 함께 쓰는 서버 함수. 어느 버튼인지는 intent 값으로 구분한다.
 * 등록 안 됨·승인 대기·거절·비밀번호 틀림은 같은 문구로 답하고(등록 여부를 드러내지 않는다),
 * 틀린 시도와 가입 신청은 횟수를 세어 많으면 잠시 막는다.
 */
export async function submitLogin(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = normalizeEmail(formData.get("email"));
  if (email === null) return { message: LOGIN_MESSAGES.invalidEmail };

  const intent = formData.get("intent") === "request" ? "request" : "login";
  const password = field(formData, "password");
  let signedIn = false;

  try {
    const client = createServiceClient();
    const ip = await clientIp();
    if (await isRateLimited(client, email, ip)) return { message: LOGIN_MESSAGES.tooMany };

    if (intent === "request") {
      // 비밀번호 규칙 안내는 이메일이 등록돼 있는지와 상관없이 똑같이 나간다.
      const check = validatePassword(password, email, field(formData, "passwordConfirm"));
      if (!check.ok) return { message: check.message };
      await recordAttempt(client, email, ip);
      return replyToRequest(await createSignupRequest(email, password));
    }

    // 로그인: 승인된 사람만 비밀번호 확인까지 간다. 그 밖에는 모두 같은 문구로 답한다.
    const decision = decideLogin(await lookupAllowedUser(email));
    if (decision !== "approved" || password.length === 0) {
      await recordAttempt(client, email, ip);
      return replyToUnapprovedLogin();
    }
    const supabase = await createSessionClient();
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      await recordAttempt(client, email, ip);
      return replyToUnapprovedLogin();
    }
    // 세션을 만든 뒤에도 허용 목록으로 한 번 더 확인한다.
    if (!(await getAccess()).ok) {
      await supabase.auth.signOut();
      return { message: LOGIN_MESSAGES.failed };
    }
    // 마지막 로그인 시각을 남긴다(누가 언제 들어왔는지 추적할 수 있게).
    await client.from("allowed_users").update({ last_login_at: new Date().toISOString() }).eq("email", email);
    signedIn = true;
  } catch (error) {
    // 내부 사정(주소·키·쿼리)은 화면에 싣지 않고 서버 기록에만 남긴다.
    console.error("로그인 처리 실패:", error instanceof Error ? error.message : error);
    return { message: LOGIN_MESSAGES.failed };
  }

  // redirect는 오류처럼 던져지므로 try 밖에서 부른다.
  if (signedIn) redirect("/");
  return { message: LOGIN_MESSAGES.failed };
}
