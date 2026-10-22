// Design Ref: §2.5 로그인 — 담당자 로그인에만 추가 확인 코드를 요구한다
// 이메일만으로 들어가는 방식은 이메일을 아는 사람이 누구나 그 사람으로 들어올 수 있다.
// 확정·승인 같은 담당자 권한은 그 위험이 크므로, 담당자는 이메일에 더해 확인 코드를 함께 넣어야 한다.
// 코드는 서버 전용 환경변수(MANAGER_LOGIN_CODE)에 있고 화면과 문서에 적지 않는다.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** 헷갈리기 쉬운 글자(0·O, 1·I·L)를 뺀 글자들. 코드를 읽고 옮겨 적을 때 실수하지 않게 한다. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

/** 새 확인 코드를 만든다. 10글자이고 약 49비트라 온라인으로 맞히기에는 충분히 길다. */
export function generateManagerCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text.trim().toUpperCase()).digest();
}

/**
 * 넣은 코드가 맞는지 확인한다.
 *  - 서버에 코드가 설정돼 있지 않으면(secret이 비어 있으면) 모두 거부한다. 잠금을 푸는 쪽으로 실패하지 않는다.
 *  - 길이가 달라도 걸리는 시간이 같도록 해시를 만들어 timingSafeEqual로 비교한다.
 *  - 대소문자와 앞뒤 공백은 무시한다.
 */
export function verifyManagerCode(
  input: unknown,
  secret: string | null | undefined,
): boolean {
  if (!secret || secret.trim().length === 0) return false;
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 200) {
    return false;
  }
  return timingSafeEqual(digest(input), digest(secret));
}
