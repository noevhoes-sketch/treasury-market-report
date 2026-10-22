// Design Ref: §2.5 로그인, CHECK.md 보안 높음 2번 — 로그인 시도 횟수 제한
// 승인되지 않은 시도(실패·등록 신청)를 이메일·접속 주소별로 세어, 창 시간(10분) 안에 한도를 넘으면 막는다.
// 연결(client)을 받아서 쓰므로 서버 전용 코드와 확인 스크립트가 함께 쓴다. 이메일·주소는 원문이 아니라 해시로만 저장한다.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_WINDOW_MINUTES, MAX_ATTEMPTS_PER_EMAIL, MAX_ATTEMPTS_PER_IP } from "./login-policy.ts";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function attemptBuckets(email: string, ip: string): { email: string; ip: string } {
  return { email: `email:${hash(email)}`, ip: `ip:${hash(ip)}` };
}

function windowStart(now: Date): string {
  return new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000).toISOString();
}

async function countSince(client: SupabaseClient, bucket: string, now: Date): Promise<number> {
  const { count, error } = await client
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .gte("created_at", windowStart(now));
  if (error) throw new Error(`시도 횟수를 읽지 못했습니다: ${error.message}`);
  return count ?? 0;
}

/** 이 이메일 또는 이 접속 주소가 한도를 넘었는가 */
export async function isRateLimited(client: SupabaseClient, email: string, ip: string, now = new Date()): Promise<boolean> {
  const buckets = attemptBuckets(email, ip);
  const [byEmail, byIp] = await Promise.all([countSince(client, buckets.email, now), countSince(client, buckets.ip, now)]);
  return byEmail >= MAX_ATTEMPTS_PER_EMAIL || byIp >= MAX_ATTEMPTS_PER_IP;
}

/** 승인되지 않은 시도 한 번을 기록한다. 하루 지난 줄은 함께 지워 표가 커지지 않게 한다. */
export async function recordAttempt(client: SupabaseClient, email: string, ip: string, now = new Date()): Promise<void> {
  const buckets = attemptBuckets(email, ip);
  const { error } = await client
    .from("login_attempts")
    .insert([{ bucket: buckets.email }, { bucket: buckets.ip }]);
  if (error) throw new Error(`시도를 기록하지 못했습니다: ${error.message}`);
  await client
    .from("login_attempts")
    .delete()
    .lt("created_at", new Date(now.getTime() - 24 * 3_600_000).toISOString());
}
