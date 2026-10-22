// Design Ref: §2.5 로그인 — 이메일 + 비밀번호 로그인의 비밀번호 규칙
// 순수 함수라 화면(서버 함수)과 계정 만들기 스크립트, 확인 스크립트가 함께 쓴다.
// 비밀번호 원문은 어디에도 저장하지 않는다(로그인 서비스가 암호화해서 보관한다).

export const PASSWORD_MIN = 10;
/** 암호화 방식(bcrypt)이 앞의 72바이트만 쓰기 때문에, 그보다 긴 비밀번호는 받지 않는다. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

/**
 * 비밀번호가 규칙에 맞는지 본다.
 *  - 10자 이상, 72바이트 이하
 *  - 이메일이나 이메일 앞부분과 같으면 안 됨, 같은 글자만 반복하면 안 됨
 *  - confirm을 주면 서로 같아야 함
 */
export function validatePassword(password: unknown, email: string, confirm?: unknown): PasswordCheck {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "비밀번호를 입력해 주세요." };
  }
  if (Array.from(password).length < PASSWORD_MIN) {
    return { ok: false, message: `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요.` };
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { ok: false, message: "비밀번호가 너무 길어요. 짧게 줄여 주세요." };
  }
  if (password.trim().length === 0 || new Set(Array.from(password)).size === 1) {
    return { ok: false, message: "비밀번호가 너무 단순해요. 다른 글자를 섞어 주세요." };
  }
  const lower = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const localPart = normalizedEmail.split("@")[0] ?? "";
  if (lower === normalizedEmail || (localPart.length >= 4 && lower === localPart)) {
    return { ok: false, message: "비밀번호를 이메일과 다르게 정해 주세요." };
  }
  if (confirm !== undefined && confirm !== password) {
    return { ok: false, message: "비밀번호 확인이 맞지 않아요." };
  }
  return { ok: true };
}
