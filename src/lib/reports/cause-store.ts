// Design Ref: §1.3 담당자 확인 화면, §2.3 담당자 확인과 열람 — 원인 문장 저장·수정·확정
// Plan 작업 13: 담당자가 문장을 고치고 확정한다. 연결(client)을 받아서 쓰므로 서버 전용 코드와 확인 스크립트가 함께 쓴다.
// (재수집으로 금리가 바뀌면 데이터베이스가 직접 확정을 풀고 원인을 "숫자 바뀜"으로 바꾼다. supabase/migrations/0001_init.sql)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CauseStatus, ReportRow } from "../db/types.ts";
import { validateCause, type CauseLine } from "../cause/validate.ts";
import type { TableRow } from "../calc/rates-format.ts";
import { syncTableStatus } from "./table-status.ts";

/** AI가 만든 한 줄의 결과: 초안이 통과했거나, 근거가 없어 비웠다. */
export type GeneratedLine = { text: string; url: string } | null;

/**
 * AI 초안을 저장한다. 문장이 없는 줄은 "근거 기사 없음"으로 둔다. 확정 정보는 건드리지 않는다.
 * 초안은 국고채 금리 표가 모두 모인 뒤에만 만들므로, 표 상태도 "완료"로 맞춘다(자동 수집을 놓친 날짜를 다시 채울 때도 확정할 수 있게).
 */
export async function storeGeneratedDraft(
  client: SupabaseClient,
  date: string,
  lines: { kr: GeneratedLine; us: GeneratedLine },
): Promise<void> {
  const { error } = await client.from("reports").upsert(
    {
      report_date: date,
      table_status: "done",
      cause_kr: lines.kr?.text ?? null,
      cause_us: lines.us?.text ?? null,
      source_url_kr: lines.kr?.url ?? null,
      source_url_us: lines.us?.url ?? null,
      cause_status_kr: lines.kr ? "draft" : "no_source",
      cause_status_us: lines.us ? "draft" : "no_source",
    },
    { onConflict: "report_date" },
  );
  if (error) throw new Error(`원인 초안을 저장하지 못했습니다: ${error.message}`);
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

/**
 * 담당자가 고친 문장을 저장한다.
 *  - 길이·형식·숫자·금지 표현을 검사한다(공백 포함 60자 이내).
 *  - 빈 줄은 "원인 없음"(근거 기사 없음)으로 둔다.
 *  - 저장하면 이전 확정은 풀린다. 고친 내용을 다시 확인하고 확정해야 한다.
 *  - 담당자가 고쳤다는 사실을 남겨 두어, 이후 자동 초안이 덮어쓰지 않게 한다.
 */
export async function saveManagerCauses(
  client: SupabaseClient,
  date: string,
  input: { kr: string; us: string },
  rows: readonly TableRow[],
): Promise<SaveResult> {
  const clean: Record<CauseLine, string | null> = { kr: null, us: null };
  for (const line of ["kr", "us"] as const) {
    const text = input[line].trim();
    if (text.length === 0) continue;
    const check = validateCause(text, line, rows);
    if (!check.ok) {
      return { ok: false, reason: `${line === "kr" ? "국고채" : "미국 금리"} 문장: ${check.reason}` };
    }
    clean[line] = check.text;
  }

  // 보고서 행이 새로 생겨도 표 상태가 "대기"로 남지 않게, 저장된 금리 기준으로 맞춘다.
  await syncTableStatus(client, date);

  const status = (line: CauseLine): CauseStatus => (clean[line] ? "draft" : "no_source");
  const { error } = await client.from("reports").upsert(
    {
      report_date: date,
      cause_kr: clean.kr,
      cause_us: clean.us,
      cause_status_kr: status("kr"),
      cause_status_us: status("us"),
      has_manager_edit: true,
      confirmed_by: null,
      confirmed_at: null,
    },
    { onConflict: "report_date" },
  );
  if (error) throw new Error(`원인 문장을 저장하지 못했습니다: ${error.message}`);
  return { ok: true };
}

/** 확정할 수 없는 이유. 확정해도 되면 null. */
export function whyCannotConfirm(
  report: Pick<ReportRow, "table_status" | "cause_status_kr" | "cause_status_us" | "cause_kr" | "cause_us"> | null,
): string | null {
  if (report === null) return "보고서가 아직 없습니다.";
  if (report.table_status !== "done") return "금리 표가 아직 완성되지 않았습니다.";
  for (const [label, status] of [
    ["국고채", report.cause_status_kr],
    ["미국 금리", report.cause_status_us],
  ] as const) {
    if (status === "stale") return `${label} 원인이 "숫자가 바뀌어 다시 확인 필요" 상태입니다. 문장을 확인해 저장해 주세요.`;
    if (status === "waiting_article") return `${label} 원인이 "기사 대기 중"입니다. 기사가 올라오기를 기다리거나 직접 문장을 입력해 저장해 주세요.`;
  }
  if (!report.cause_kr && !report.cause_us) return "확정할 원인 문장이 없습니다.";
  return null;
}

/** 담당자가 확정한다. 확정한 사람의 번호(이메일이 아님)와 시각이 남는다. */
export async function confirmReport(
  client: SupabaseClient,
  date: string,
  userId: number,
): Promise<SaveResult> {
  await syncTableStatus(client, date);
  const { data, error } = await client
    .from("reports")
    .select("table_status, cause_status_kr, cause_status_us, cause_kr, cause_us")
    .eq("report_date", date)
    .maybeSingle<
      Pick<ReportRow, "table_status" | "cause_status_kr" | "cause_status_us" | "cause_kr" | "cause_us">
    >();
  if (error) throw new Error(`보고서를 읽지 못했습니다: ${error.message}`);

  const reason = whyCannotConfirm(data);
  if (reason) return { ok: false, reason };

  const update = await client
    .from("reports")
    .update({ confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq("report_date", date)
    .select("report_date");
  if (update.error) throw new Error(`확정하지 못했습니다: ${update.error.message}`);
  return (update.data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "보고서를 찾지 못했습니다." };
}
