// Design Ref: §2.5 로그인 — 허용 목록을 건너뛰는 길을 막는다, §1.1 로그인 화면 (신청 → 담당자 승인 → 이메일만으로 로그인)
// CHECK.md 보안 높음 1번
//
// 핵심 규칙
//  1) "로그인했다"는 사실만으로 들여보내지 않는다. 매 요청마다 허용 목록(allowed_users)에서
//     그 이메일이 지금도 "승인" 상태인지 다시 확인한다. 그래서 목록에서 지우거나 거절로 바꾼 사람은 바로 막힌다.
//  2) 역할(담당자/열람자)은 허용 목록 표에서만 가져온다. 사용자가 고칠 수 있는
//     user_metadata 같은 곳의 값은 절대 읽지 않는다.
//  3) 이메일만으로 로그인하므로(메일 인증 없음) 승인 상태가 유일한 관문이다. 승인은 담당자만 한다.
//
// 실제 데이터베이스 조회(lookup)는 서버 전용 코드가 넣는다.
// 여기서는 조회 함수를 받아서 판단만 하므로 패키지 없이 확인할 수 있다.
// (db/types는 타입만 가져온다. 그래서 확인 스크립트에서 이 파일을 바로 실행할 수 있다)

import type { AllowedUserRow, Role } from "../db/types";

/** 허용 목록에서 이메일로 한 줄을 찾는 함수. 없으면 null. (서버에서 데이터베이스를 읽는 코드가 채운다) */
export type AllowedUserLookup = (
  email: string,
) => Promise<AllowedUserRow | null>;

export type AccessResult =
  | { ok: true; user: { id: number; email: string; role: Role } }
  | { ok: false; reason: "no-session" | "not-allowed" };

/** 로그인 창에 이메일을 넣었을 때의 결과: 승인됨 / 승인 대기 / 거절됨 / 등록되지 않음 */
export type LoginDecision = "approved" | "pending" | "rejected" | "unknown";

/** 이메일을 비교하기 좋게 다듬는다. 이메일 모양이 아니면 null. */
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // 아주 느슨한 모양만 확인한다. 진짜 확인은 허용 목록에 있는지로 한다.
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

/** 허용 목록의 한 줄(없으면 null)로 로그인 창의 결과를 정한다. */
export function decideLogin(
  row: Pick<AllowedUserRow, "status"> | null,
): LoginDecision {
  if (row === null) return "unknown";
  if (row.status === "approved") return "approved";
  if (row.status === "pending") return "pending";
  return "rejected";
}

/**
 * 요청마다 부르는 판단 함수.
 * sessionEmail은 "로그인 세션이 알려 준 이메일"이다. 세션에 붙은 역할 값은 받지 않는다.
 * 승인된 사람만 통과한다.
 */
export async function resolveAccess(
  sessionEmail: unknown,
  lookup: AllowedUserLookup,
): Promise<AccessResult> {
  const email = normalizeEmail(sessionEmail);
  if (email === null) return { ok: false, reason: "no-session" };

  const row = await lookup(email);
  // 목록에 없거나, 승인 상태가 아니거나, 조회 결과가 같은 이메일이 아니면 막는다.
  if (
    row === null ||
    row.status !== "approved" ||
    normalizeEmail(row.email) !== email
  ) {
    return { ok: false, reason: "not-allowed" };
  }
  return { ok: true, user: { id: row.id, email: row.email, role: row.role } };
}

/** 담당자만 가능한 일(승인·확정·수정·직접 입력)인가? */
export function isManager(access: AccessResult): boolean {
  return access.ok && access.user.role === "manager";
}

/**
 * 로그인 뒤에 돌아갈 주소를 안전하게 고른다. 우리 사이트 안의 주소("/"로 시작)만 허용한다.
 * 그 외(다른 사이트, "//evil.com", "/\evil.com" 등)는 첫 화면("/")으로 보낸다.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
