// Design Ref: §4.4 자동 실행 주소 잠금 — 요청의 Authorization: Bearer <CRON_SECRET> 값을 확인한다
// CHECK.md 보안 높음 2번. Vercel Cron은 CRON_SECRET이 설정돼 있으면 이 헤더를 자동으로 붙여 보낸다.

import { timingSafeEqual } from "node:crypto";

/**
 * 자동 실행 요청이 맞는지 확인한다.
 *  - secret이 비어 있으면(설정 안 된 환경) 잠금을 푸는 대신 모두 거부한다.
 *  - 비교는 시간 차이로 값을 알아내지 못하게 timingSafeEqual로 한다.
 */
export function verifyCronAuth(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  // 길이가 다르면 timingSafeEqual이 오류를 내므로, 같은 길이로 맞춰 비교한 뒤 길이도 함께 확인한다.
  if (received.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(received, expected);
}
