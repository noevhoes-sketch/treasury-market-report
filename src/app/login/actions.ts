"use server";

// Design Ref: §1.1 로그인 화면, §2.5 로그인 — 신청 → 담당자 승인 → 이메일만으로 로그인
//
// 이메일만으로 로그인하므로 메일 인증이 없다. 승인된 이메일을 아는 사람은 누구나 그 사람으로 들어올 수 있다.
// (담당자 이메일도 마찬가지다. 담당자로 등록된 이메일을 입력하면 담당자로 로그인된다)
// (교육 실습용 임시 방식. 실제 도입 때는 사내 메신저 로그인 연동으로 바꾼다 — PRD 7번)
import { redirect } from "next/navigation";
import { decideLogin, normalizeEmail } from "@/lib/auth/access";
import { createSessionClient, getAccess } from "@/lib/auth/session";
import { createPendingRequest } from "@/lib/db/access-requests";
import { lookupAllowedUser } from "@/lib/db/allowed-users";
import { createServiceClient } from "@/lib/db/server";

export type LoginFormState = {
  message: string | null;
  /** 등록되지 않은 이메일이라 [등록 신청] 버튼을 보여줄 때 true */
  canRequest: boolean;
};

const MESSAGES = {
  invalidEmail: "이메일 형식이 올바르지 않습니다.",
  unknown: "등록되지 않은 이메일입니다. 아래 [등록 신청]을 눌러 주세요.",
  pending: "승인 대기 중입니다. 담당자가 승인하면 같은 이메일로 로그인할 수 있어요.",
  rejected: "승인되지 않은 이메일입니다. 담당자에게 문의해 주세요.",
  requested: "신청했어요. 담당자가 승인하면 같은 이메일로 로그인할 수 있어요.",
  alreadyApproved: "이미 승인된 이메일입니다. [로그인]을 눌러 주세요.",
  full: "대기 중인 신청이 많아 지금은 접수할 수 없어요. 담당자에게 문의해 주세요.",
  failed: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
} as const;

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

/** 로그인 창의 [로그인]·[등록 신청] 두 버튼이 함께 쓰는 서버 함수. 어느 버튼인지는 intent 값으로 구분한다. */
export async function submitLogin(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = normalizeEmail(formData.get("email"));
  if (email === null) return { message: MESSAGES.invalidEmail, canRequest: false };

  const intent = formData.get("intent") === "request" ? "request" : "login";
  let approvedAndSignedIn = false;

  try {
    const row = await lookupAllowedUser(email);
    const decision = decideLogin(row);

    if (intent === "request") {
      if (decision === "approved") return { message: MESSAGES.alreadyApproved, canRequest: false };
      if (decision === "pending") return { message: MESSAGES.pending, canRequest: false };
      if (decision === "rejected") return { message: MESSAGES.rejected, canRequest: false };
      const result = await createPendingRequest(email);
      return {
        message: result === "full" ? MESSAGES.full : MESSAGES.requested,
        canRequest: false,
      };
    }

    if (decision === "approved") {
      approvedAndSignedIn = await startSession(email);
      // 세션을 만든 뒤에도 허용 목록으로 한 번 더 확인한다.
      if (approvedAndSignedIn && !(await getAccess()).ok) approvedAndSignedIn = false;
      if (!approvedAndSignedIn) return { message: MESSAGES.failed, canRequest: false };
    } else if (decision === "pending") {
      return { message: MESSAGES.pending, canRequest: false };
    } else if (decision === "rejected") {
      return { message: MESSAGES.rejected, canRequest: false };
    } else {
      return { message: MESSAGES.unknown, canRequest: true };
    }
  } catch (error) {
    // 내부 사정(주소·키·쿼리)은 화면에 싣지 않고 서버 기록에만 남긴다.
    console.error("로그인 처리 실패:", error instanceof Error ? error.message : error);
    return { message: MESSAGES.failed, canRequest: false };
  }

  // redirect는 오류처럼 던져지므로 try 밖에서 부른다.
  if (approvedAndSignedIn) redirect("/");
  return { message: MESSAGES.failed, canRequest: false };
}
