// Design Ref: §2.5 로그인 — 매 요청마다 허용 목록(allowed_users)에서 이메일을 다시 확인한다
// CHECK.md 보안 높음 1번: auth/access.ts의 resolveAccess가 이 조회 함수를 받아 판단한다.
import "server-only";

import type { AllowedUserLookup } from "../auth/access";
import type { AllowedUserRow } from "./types";
import { createServiceClient } from "./server";

/** 허용 목록에서 이메일로 한 줄을 찾는다. 없으면 null. 값은 .eq로 안전하게 넘긴다. */
export const lookupAllowedUser: AllowedUserLookup = async (email) => {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .select("id, email, role")
    .eq("email", email)
    .maybeSingle<AllowedUserRow>();
  // 조회가 실패하면 "허용"으로 넘어가지 않도록 오류를 그대로 던진다.
  if (error) throw new Error(`허용 목록을 읽지 못했습니다: ${error.message}`);
  return data;
};
