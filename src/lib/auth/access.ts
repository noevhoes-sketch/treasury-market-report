// Design Ref: §2.5 로그인 — 허용 목록을 건너뛰는 길을 막는다, §1.1 로그인 화면 문구
// CHECK.md 보안 높음 1번: 허용 목록을 거치지 않고 로그인할 수 있는 길
//
// 핵심 규칙
//  1) "로그인했다"는 사실만으로 들여보내지 않는다. 매 요청마다 허용 목록(allowed_users)에서
//     그 이메일이 지금도 있는지 다시 확인한다. 그래서 목록에서 지운 사람은 바로 막힌다.
//  2) 역할(담당자/열람자)은 허용 목록 표에서만 가져온다. 사용자가 고칠 수 있는
//     user_metadata 같은 곳의 값은 절대 읽지 않는다.
//  3) 로그인 화면은 어떤 이메일이든 같은 문구를 보여준다. 목록에 있는지 알려주지 않는다.
//
// 실제 데이터베이스 조회(lookup)는 Supabase를 연결할 때 서버 전용 코드로 넣는다.
// 여기서는 조회 함수를 받아서 판단만 하므로 패키지 없이 확인할 수 있다.
// (db/types는 타입만 가져온다. 그래서 확인 스크립트에서 이 파일을 바로 실행할 수 있다)

import type { AllowedUserRow, Role } from "../db/types";

/** 허용 목록에서 이메일로 한 줄을 찾는 함수. 없으면 null. (서버에서 데이터베이스를 읽는 코드가 채운다) */
export type AllowedUserLookup = (
  email: string,
) => Promise<AllowedUserRow | null>;

/** 로그인 화면에 항상 보여주는 문구 (DESIGN §1.1). 목록 포함 여부를 드러내지 않는다. */
export const LOGIN_NEUTRAL_MESSAGE =
  "등록된 이메일이면 로그인 링크를 보냈습니다.";

export type AccessResult =
  | { ok: true; user: { id: number; email: string; role: Role } }
  | { ok: false; reason: "no-session" | "not-allowed" };

/** 이메일을 비교하기 좋게 다듬는다. 이메일 모양이 아니면 null. */
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // 아주 느슨한 모양만 확인한다. 진짜 확인은 허용 목록에 있는지로 한다.
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 요청마다 부르는 판단 함수.
 * sessionEmail은 "로그인 세션이 알려 준 이메일"이다. 세션에 붙은 역할 값은 받지 않는다.
 */
export async function resolveAccess(
  sessionEmail: unknown,
  lookup: AllowedUserLookup,
): Promise<AccessResult> {
  const email = normalizeEmail(sessionEmail);
  if (email === null) return { ok: false, reason: "no-session" };

  const row = await lookup(email);
  // 목록에 없거나, 조회 결과가 같은 이메일이 아니면 막는다.
  if (row === null || normalizeEmail(row.email) !== email) {
    return { ok: false, reason: "not-allowed" };
  }
  return { ok: true, user: { id: row.id, email: row.email, role: row.role } };
}

/** 담당자만 가능한 일(확정·수정·직접 입력)인가? */
export function isManager(access: AccessResult): boolean {
  return access.ok && access.user.role === "manager";
}

/**
 * 로그인 링크를 보내도 되는가? 허용 목록에 있는 이메일만 true.
 * 호출하는 쪽은 결과와 상관없이 항상 LOGIN_NEUTRAL_MESSAGE만 화면에 보여준다.
 * (그리고 새 가입을 만들지 않는 옵션 shouldCreateUser: false로 링크를 보낸다)
 */
export async function shouldSendLoginLink(
  email: unknown,
  lookup: AllowedUserLookup,
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (normalized === null) return false;
  const row = await lookup(normalized);
  return row !== null && normalizeEmail(row.email) === normalized;
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
