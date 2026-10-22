// Design Ref: §2.5 로그인 — 로그인 창의 답 문구는 등록 여부를 드러내지 않게 하나로 통일한다
// 승인되지 않은 경우(등록 안 됨·승인 대기·거절)와 비밀번호가 틀린 경우는 모두 같은 문구와 같은 화면으로 답한다.
// 그래서 문구만 봐서는 누가 직원 명단에 있는지, 비밀번호만 틀렸는지 알 수 없다.
// 순수 함수라 패키지 없이 확인 스크립트로 시험할 수 있다. (db/types 등은 가져오지 않는다)

import type { LoginDecision } from "./access.ts";

/** 이 횟수를 넘기면 잠시 막는다. (창 시간 안에서 센다) */
export const LOGIN_WINDOW_MINUTES = 10;
export const MAX_ATTEMPTS_PER_EMAIL = 5;
export const MAX_ATTEMPTS_PER_IP = 30;

export const LOGIN_MESSAGES = {
  invalidEmail: "이메일 형식이 올바르지 않습니다.",
  /** 등록 안 됨 · 승인 대기 · 거절 · 비밀번호 틀림을 구분하지 않는 하나의 문구 */
  notApproved: "로그인할 수 없어요. 이메일과 비밀번호를 확인해 주세요. 처음이거나 승인 전이라면 [가입 신청]을 이용해 주세요.",
  /** 신청 결과도 이미 있는 이메일(승인·대기·거절)과 새 이메일을 구분하지 않는다 */
  requested: "가입 신청을 받았어요. 담당자가 승인하면 이메일과 비밀번호로 로그인할 수 있어요.",
  full: "지금은 신청을 받을 수 없어요. 담당자에게 문의해 주세요.",
  tooMany: `시도가 너무 많아요. ${LOGIN_WINDOW_MINUTES}분 뒤에 다시 시도해 주세요.`,
  failed: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
} as const;

export type LoginReply = { message: string };

/** 로그인 버튼을 눌렀는데 들어갈 수 없는 경우의 답. 승인된 사람이 비밀번호까지 맞으면 로그인 처리로 간다. */
export function replyToUnapprovedLogin(decision?: Exclude<LoginDecision, "approved">): LoginReply {
  void decision; // 일부러 쓰지 않는다: 등록 안 됨·대기·거절·비밀번호 틀림이 같은 답이어야 한다.
  return { message: LOGIN_MESSAGES.notApproved };
}

/** 가입 신청 버튼의 답. 새 이메일이면 저장하고, 이미 있는 이메일이면 저장 없이 같은 문구로 답한다. */
export function replyToRequest(outcome: "saved" | "exists" | "full"): LoginReply {
  return { message: outcome === "full" ? LOGIN_MESSAGES.full : LOGIN_MESSAGES.requested };
}
