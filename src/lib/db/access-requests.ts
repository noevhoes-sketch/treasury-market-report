// Design Ref: §2.5 로그인 — 신청(승인 대기) 저장, 담당자의 승인·거절
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

/** 신청을 "승인 대기"로 저장한다. 접수했으면 true, 대기 신청이 너무 많으면 "full". */
export async function createPendingRequest(email: string): Promise<true | "full"> {
  const client = createServiceClient();
  // 오래된 신청은 지운다(개인정보를 오래 두지 않고, 가짜 신청이 자리를 오래 차지하지 못하게 한다): 대기 14일, 거절 30일.
  const day = 24 * 3_600_000;
  await client.from("allowed_users").delete().eq("status", "pending").lt("requested_at", new Date(Date.now() - PENDING_KEEP_DAYS * day).toISOString());
  await client.from("allowed_users").delete().eq("status", "rejected").lt("requested_at", new Date(Date.now() - REJECTED_KEEP_DAYS * day).toISOString());
  const count = await client
    .from("allowed_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (count.error) throw new Error(`신청 수를 읽지 못했습니다: ${count.error.message}`);
  if ((count.count ?? 0) >= MAX_PENDING_REQUESTS) return "full";

  // 같은 이메일이 동시에 두 번 들어와도 한 줄만 생기도록 이메일 중복 제한(unique)에 맡긴다.
  const { error } = await client
    .from("allowed_users")
    .insert({ email, role: "viewer", status: "pending" });
  if (error && error.code !== "23505") {
    throw new Error(`신청을 저장하지 못했습니다: ${error.message}`);
  }
  return true;
}

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
