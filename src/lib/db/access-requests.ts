// Design Ref: §2.5 로그인 — 담당자의 승인·거절, 승인 대기 목록 (가입 신청 저장은 auth-users.ts)
// 서버에서만 쓴다(server-only). 승인·거절은 requireManager()를 통과한 서버 함수에서만 부른다.
import "server-only";

import type { Role } from "./types";
import { createServiceClient } from "./server";

/** 승인 대기 신청이 이만큼 쌓이면 새 신청을 받지 않는다. 신청 화면은 로그인 없이 열려 있어서 표가 부풀지 않게 막는다. */
export const MAX_PENDING_REQUESTS = 50;
/** 승인되지 않은 신청을 보관하는 날수(지난 뒤 자동으로 지운다) */
export const PENDING_KEEP_DAYS = 14;
export const REJECTED_KEEP_DAYS = 30;

export type PendingRequest = { id: number; email: string; requested_at: string };

/** 승인 대기 신청 목록(오래된 순). */
export async function listPendingRequests(): Promise<PendingRequest[]> {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .select("id, email, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(MAX_PENDING_REQUESTS)
    .returns<PendingRequest[]>();
  if (error) throw new Error(`신청 목록을 읽지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** 신청을 승인한다. 역할은 담당자가 정한다. 승인한 사람과 시각을 남긴다. 승인할 신청이 없으면 false. */
export async function approveRequest(id: number, role: Role, approverId: number): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .update({
      status: "approved",
      role,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`승인하지 못했습니다: ${error.message}`);
  return (data ?? []).length > 0;
}

/** 신청을 거절한다. 거절한 사람과 시각을 남긴다. */
export async function rejectRequest(id: number, approverId: number): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .update({
      status: "rejected",
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`거절하지 못했습니다: ${error.message}`);
  return (data ?? []).length > 0;
}
