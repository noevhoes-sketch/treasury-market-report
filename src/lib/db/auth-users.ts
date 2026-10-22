// Design Ref: §2.5 로그인 — 이메일 + 비밀번호 로그인 계정(Supabase 로그인 서비스)과 허용 목록을 함께 다룬다
// 서버에서만 쓴다(server-only). 서버 전용 키로 로그인 서비스의 관리 기능을 부르므로 화면 코드에서 불러오면 빌드가 실패한다.
//  - 가입 신청: 계정을 만들고(비밀번호는 로그인 서비스가 암호화해 보관) 허용 목록에 "승인 대기"로 올린다
//  - 승인은 담당자만(access-requests.ts). 승인 전에는 로그인 계정이 있어도 앱이 들여보내지 않는다(요청마다 허용 목록 확인)
//  - 오래된 신청은 허용 목록 줄과 계정을 함께 지운다
//  - 담당자가 사용자의 비밀번호를 새로 정해 줄 수 있다(비밀번호를 잊었을 때)
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./server";
import { MAX_PENDING_REQUESTS, PENDING_KEEP_DAYS, REJECTED_KEEP_DAYS } from "./access-requests";
import { lookupAllowedUser } from "./allowed-users";

type Admin = SupabaseClient["auth"]["admin"];

/** 이메일로 로그인 계정 번호를 찾는다. 이용자가 30~50명 규모라 목록을 페이지별로 훑어 찾는다. 없으면 null. */
export async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`로그인 계정을 찾지 못했습니다: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** 대기 14일·거절 30일이 지난 신청을 허용 목록과 로그인 계정에서 함께 지운다. */
export async function purgeStaleRequests(): Promise<void> {
  const client = createServiceClient();
  const day = 24 * 3_600_000;
  const groups = [
    { status: "pending", days: PENDING_KEEP_DAYS },
    { status: "rejected", days: REJECTED_KEEP_DAYS },
  ] as const;
  for (const group of groups) {
    const cutoff = new Date(Date.now() - group.days * day).toISOString();
    const stale = await client
      .from("allowed_users")
      .select("id, auth_user_id")
      .eq("status", group.status)
      .lt("requested_at", cutoff)
      .returns<{ id: number; auth_user_id: string | null }[]>();
    if (stale.error) throw new Error(`오래된 신청을 읽지 못했습니다: ${stale.error.message}`);
    for (const row of stale.data ?? []) {
      // 허용 목록 줄을 먼저 지운 뒤 계정을 지운다. 계정을 못 지워도 앱에는 영향이 없다(허용 목록에 없으면 못 들어온다).
      await client.from("allowed_users").delete().eq("id", row.id).eq("status", group.status);
      if (row.auth_user_id) await client.auth.admin.deleteUser(row.auth_user_id);
    }
  }
}

export type SignupOutcome = "saved" | "exists" | "full";

/**
 * 가입 신청을 저장한다. 이미 등록된 이메일(대기·승인·거절)이면 아무것도 바꾸지 않고 "exists"를 돌려준다(남의 비밀번호를 바꾸지 못하게).
 * 새 이메일이면 로그인 계정을 만들고 허용 목록에 "승인 대기"로 올린다.
 */
export async function createSignupRequest(email: string, password: string): Promise<SignupOutcome> {
  const client = createServiceClient();
  await purgeStaleRequests();

  const count = await client.from("allowed_users").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (count.error) throw new Error(`신청 수를 읽지 못했습니다: ${count.error.message}`);
  if ((count.count ?? 0) >= MAX_PENDING_REQUESTS) return "full";

  if ((await lookupAllowedUser(email)) !== null) return "exists";

  const admin = client.auth.admin;
  let authUserId: string | null = null;
  const created = await admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      throw new Error(`계정을 만들지 못했습니다: ${created.error.message}`);
    }
    // 허용 목록에는 없는데 계정만 남은 경우(예전 신청을 지운 뒤 등): 승인 전까지 아무 권한이 없으므로 새 비밀번호로 바꿔 쓴다.
    authUserId = await findAuthUserIdByEmail(admin, email);
    if (authUserId === null) throw new Error("로그인 계정을 찾지 못했습니다.");
    const updated = await admin.updateUserById(authUserId, { password, email_confirm: true });
    if (updated.error) throw new Error(`계정을 갱신하지 못했습니다: ${updated.error.message}`);
  } else {
    authUserId = created.data.user.id;
  }

  const { error } = await client
    .from("allowed_users")
    .insert({ email, role: "viewer", status: "pending", auth_user_id: authUserId });
  if (error) {
    if (error.code === "23505") return "exists"; // 동시에 같은 이메일이 들어온 경우
    throw new Error(`신청을 저장하지 못했습니다: ${error.message}`);
  }
  return "saved";
}

export type ApprovedUser = { id: number; email: string; role: string };

/** 승인된 사용자 목록(담당자 화면의 비밀번호 설정용). */
export async function listApprovedUsers(): Promise<ApprovedUser[]> {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .select("id, email, role")
    .eq("status", "approved")
    .order("email", { ascending: true })
    .returns<ApprovedUser[]>();
  if (error) throw new Error(`승인된 사용자를 읽지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** 승인된 사용자 한 명(없으면 null). */
export async function findApprovedUser(id: number): Promise<{ id: number; email: string; authUserId: string | null } | null> {
  const { data, error } = await createServiceClient()
    .from("allowed_users")
    .select("id, email, auth_user_id")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle<{ id: number; email: string; auth_user_id: string | null }>();
  if (error) throw new Error(`사용자를 읽지 못했습니다: ${error.message}`);
  return data ? { id: data.id, email: data.email, authUserId: data.auth_user_id } : null;
}

/** 승인된 사용자의 비밀번호를 새로 정한다. 계정이 없으면(예전 방식으로 등록된 사람) 새로 만든다. */
export async function setUserPassword(user: { id: number; email: string; authUserId: string | null }, password: string): Promise<void> {
  const client = createServiceClient();
  const admin = client.auth.admin;
  let authUserId = user.authUserId ?? (await findAuthUserIdByEmail(admin, user.email));
  if (authUserId === null) {
    const created = await admin.createUser({ email: user.email, password, email_confirm: true });
    if (created.error) throw new Error(`계정을 만들지 못했습니다: ${created.error.message}`);
    authUserId = created.data.user.id;
  } else {
    const updated = await admin.updateUserById(authUserId, { password, email_confirm: true });
    if (updated.error) throw new Error(`비밀번호를 바꾸지 못했습니다: ${updated.error.message}`);
  }
  if (user.authUserId !== authUserId) {
    await client.from("allowed_users").update({ auth_user_id: authUserId }).eq("id", user.id);
  }
}
