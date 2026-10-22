// Design Ref: §2.2 등락 원인 초안 (자동, 기사가 올라온 뒤): ① 기사 찾기 ② AI 초안 ③ 검사 ④ 저장
// Plan 작업 12·14: 자동 실행 주소와 확인 스크립트가 함께 쓰는 "원인 초안 한 번" 흐름.
// 여러 번 불러도 안전하다: 담당자가 고쳤거나 확정한 보고서, 이미 초안이 있는 보고서는 건드리지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReportTable } from "../calc/rates-format.ts";
import { pickReportInputs } from "../calc/report-table.ts";
import { fetchKrHolidaySetWith, fetchRatesForReportWith } from "../reports/rates-window.ts";
import { storeGeneratedDraft, type GeneratedLine } from "../reports/cause-store.ts";
import type { ReportRow } from "../db/types.ts";
import { requestDraft } from "./draft.ts";
import { findClosingArticle, type Article } from "./infomax.ts";
import { validateCause, type CauseLine } from "./validate.ts";

export type CauseRunStatus =
  /** 담당자가 이미 확정했다 */
  | "skipped-confirmed"
  /** 담당자가 고친 적이 있다 */
  | "skipped-edited"
  /** 이미 초안(또는 근거 없음 판단)이 있다 */
  | "skipped-existing"
  /** 금리 표가 아직 완성되지 않았다 */
  | "table-incomplete"
  /** 그날 [채권-마감] 기사가 아직 없다 */
  | "waiting-article"
  /** AI 요청에 실패했다(다음에 다시 시도) */
  | "ai-failed"
  /** 초안을 저장했다 */
  | "stored";

export type CauseRunResult = {
  date: string;
  status: CauseRunStatus;
  /** 줄별 결과: 초안 문장이 통과했는지, 걸러졌다면 이유 */
  kr?: string;
  us?: string;
  articleUrl?: string;
  message?: string;
};

type Deps = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** 확인용으로 기사 찾기를 바꿔 끼운다 */
  findArticle?: (date: string) => Promise<Article | null>;
};

type ExistingReport = Pick<
  ReportRow,
  "cause_status_kr" | "cause_status_us" | "has_manager_edit" | "confirmed_at"
>;

export async function generateCauseDraft(
  client: SupabaseClient,
  date: string,
  deps: Deps,
): Promise<CauseRunResult> {
  const existing = await client
    .from("reports")
    .select("cause_status_kr, cause_status_us, has_manager_edit, confirmed_at")
    .eq("report_date", date)
    .maybeSingle<ExistingReport>();
  if (existing.error) throw new Error(`보고서를 읽지 못했습니다: ${existing.error.message}`);

  const report = existing.data;
  if (report?.confirmed_at) return { date, status: "skipped-confirmed" };
  if (report?.has_manager_edit) return { date, status: "skipped-edited" };
  if (report && (report.cause_status_kr !== "waiting_article" || report.cause_status_us !== "waiting_article")) {
    return { date, status: "skipped-existing" };
  }

  // 표 숫자: 문장 검사와 AI 요청에 쓴다. 국고채 값이 모두 모이기 전에는 초안을 만들지 않는다.
  const records = await fetchRatesForReportWith(client, date);
  const rows = buildReportTable(pickReportInputs(records, date, await fetchKrHolidaySetWith(client, date)));
  if (rows.some((row) => row.instrument.startsWith("kr") && row.today.text === "미수집")) {
    return { date, status: "table-incomplete" };
  }

  const article = await (deps.findArticle ?? ((d) => findClosingArticle(d, deps.fetchImpl)))(date);
  if (article === null) return { date, status: "waiting-article" };

  let raw;
  try {
    raw = await requestDraft(rows, article.text, {
      apiKey: deps.apiKey,
      model: deps.model,
      fetchImpl: deps.fetchImpl,
    });
  } catch (error) {
    return {
      date,
      status: "ai-failed",
      articleUrl: article.url,
      message: error instanceof Error ? error.message : "AI 요청에 실패했습니다.",
    };
  }

  const lines: Record<CauseLine, GeneratedLine> = { kr: null, us: null };
  const notes: Record<CauseLine, string> = { kr: "", us: "" };
  for (const line of ["kr", "us"] as const) {
    const candidate = raw[line];
    if (candidate === null) {
      notes[line] = "AI가 근거 없음으로 답함";
      continue;
    }
    // 근거 링크는 AI 답이 아니라 코드가 실제로 가져온 기사 주소를 쓴다.
    const check = validateCause(candidate, line, rows, article.text);
    if (check.ok) {
      lines[line] = { text: check.text, url: article.url };
      notes[line] = "통과";
    } else {
      notes[line] = `걸러짐: ${check.reason}`;
    }
  }

  await storeGeneratedDraft(client, date, lines);
  return { date, status: "stored", kr: notes.kr, us: notes.us, articleUrl: article.url };
}
