"use server";

// Design Ref: §1.1 로그인 화면, §2.5 로그인 — 신청 → 담당자 승인 → 이메일만으로 로그인
//
// 이메일만으로 로그인하므로 메일 인증이 없다. 승인된 이메일을 아는 사람은 누구나 그 사람으로 들어올 수 있다.
// (담당자 이메일도 마찬가지다. 담당자로 등록된 이메일을 입력하면 담당자로 로그인된다)
// (교육 실습용 임시 방식. 실제 도입 때는 사내 메신저 로그인 연동으로 바꾼다 — PRD 7번)
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { decideLogin, normalizeEmail } from "@/lib/auth/access";
import { LOGIN_MESSAGES, replyToRequest, replyToUnapprovedLogin } from "@/lib/auth/login-policy";
import { isRateLimited, recordAttempt } from "@/lib/auth/rate-limit";
import { createSessionClient, getAccess } from "@/lib/auth/session";
import { createPendingRequest } from "@/lib/db/access-requests";
import { lookupAllowedUser } from "@/lib/db/allowed-users";
import { createServiceClient } from "@/lib/db/server";

export type LoginFormState = {
  message: string | null;
  /** 등록되지 않은 이메일이라 [등록 신청] 버튼을 보여줄 때 true */
  canRequest: boolean;
};

/** 승인된 이메일로 로그인 세션을 만든다. 메일은 보내지 않는다. */
async function startSession(email: string): Promise<boolean> {
  const admin = createServiceClient();
  // 로그인 계정이 없으면 만든다(새 가입은 꺼 두었지만 관리 기능으로는 만들 수 있다).
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    return false;
  }
  // 일회용 확인 값을 서버에서 만들어 그 자리에서 바로 쓴다. 이 값은 사용자에게 나가지 않는다.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return false;

  const supabase = await createSessionClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  return !verified.error;
}

/** 접속 주소: Vercel이 붙여 주는 x-forwarded-for의 첫 값. 없으면 "unknown". */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * 로그인 창의 [로그인]·[등록 신청] 두 버튼이 함께 쓰는 서버 함수. 어느 버튼인지는 intent 값으로 구분한다.
 * 등록 안 됨·승인 대기·거절은 같은 문구로 답하고(등록 여부를 드러내지 않는다), 승인되지 않은 시도는 횟수를 세어 많으면 잠시 막는다.
 */
export async function submitLogin(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = normalizeEmail(formData.get("email"));
  if (email === null) return { message: LOGIN_MESSAGES.invalidEmail, canRequest: false };

  const intent = formData.get("intent") === "request" ? "request" : "login";
  let approvedAndSignedIn = false;

  try {
    const client = createServiceClient();
    const ip = await clientIp();
    const decision = decideLogin(await lookupAllowedUser(email));

    if (decision === "approved") {
      // 승인된 이메일의 신청 버튼은 아무것도 저장하지 않고 같은 문구로 답한다. (시도 횟수도 세지 않아 남이 대신 잠글 수 없다)
      if (intent === "request") return replyToRequest("exists");
      approvedAndSignedIn = await startSession(email);
      // 세션을 만든 뒤에도 허용 목록으로 한 번 더 확인한다.
      if (approvedAndSignedIn && !(await getAccess()).ok) approvedAndSignedIn = false;
      if (!approvedAndSignedIn) return { message: LOGIN_MESSAGES.failed, canRequest: false };
      // 마지막 로그인 시각을 남긴다(누가 언제 들어왔는지 추적할 수 있게).
      await client.from("allowed_users").update({ last_login_at: new Date().toISOString() }).eq("email", email);
    } else {
      // 승인되지 않은 시도: 한도를 넘었으면 막고, 아니면 한 번 기록한다.
      if (await isRateLimited(client, email, ip)) return { message: LOGIN_MESSAGES.tooMany, canRequest: false };
      await recordAttempt(client, email, ip);

      if (intent === "login") return replyToUnapprovedLogin(decision);
      // 등록 신청: 새 이메일만 저장하고, 이미 있는 이메일(대기·거절)은 저장 없이 같은 문구로 답한다.
      if (decision !== "unknown") return replyToRequest("exists");
      const result = await createPendingRequest(email);
      return replyToRequest(result === "full" ? "full" : "saved");
    }
  } catch (error) {
    // 내부 사정(주소·키·쿼리)은 화면에 싣지 않고 서버 기록에만 남긴다.
    console.error("로그인 처리 실패:", error instanceof Error ? error.message : error);
    return { message: LOGIN_MESSAGES.failed, canRequest: false };
  }

  // redirect는 오류처럼 던져지므로 try 밖에서 부른다.
  if (approvedAndSignedIn) redirect("/");
  return { message: LOGIN_MESSAGES.failed, canRequest: false };
}
