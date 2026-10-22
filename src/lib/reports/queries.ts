// Design Ref: §1.2 보고서 화면, §1.4 목록, §1.3 확인 화면 — 화면이 읽고 쓰는 데이터 묶음
// 서버에서만 쓴다(server-only). 서버 전용 키로 데이터베이스를 읽으므로 화면(브라우저) 코드에서 불러오면 빌드가 실패한다.
import "server-only";

import type { RateRecord } from "../calc/report-table";
import { createServiceClient } from "../db/server";
import type { Instrument, ReportRow } from "../db/types";
import { fetchKrHolidaySetWith, fetchRatesForReportWith, minusDays } from "./rates-window";
import { TREND_DAYS, TREND_INSTRUMENTS, type TrendRecord } from "./trend";

/** 한 보고서에 필요한 금리 줄(보고서 날짜·지난달 말·지난해 말 근처). */
export async function fetchRatesForReport(date: string): Promise<RateRecord[]> {
  return fetchRatesForReportWith(createServiceClient(), date);
}

/** 금리 추이 그래프용: 보고서 날짜 앞 약 7주의 국고채 값(보류 포함, 그릴 때 거른다). */
export async function fetchTrendRecords(date: string): Promise<TrendRecord[]> {
  const { data, error } = await createServiceClient()
    .from("rates")
    .select("rate_date, instrument, rate, held")
    .in("instrument", [...TREND_INSTRUMENTS])
    .gte("rate_date", minusDays(date, TREND_DAYS))
    .lte("rate_date", date)
    .order("rate_date", { ascending: true })
    .returns<TrendRecord[]>();
  if (error) throw new Error(`금리 추이를 읽지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** 표 계산용 한국 휴장일 모음(전년말 근처 ~ 보고서 날짜). */
export async function fetchKrHolidaySet(date: string): Promise<Set<string>> {
  return fetchKrHolidaySetWith(createServiceClient(), date);
}

/** 보고서 한 건(없으면 null). */
export async function fetchReportRow(date: string): Promise<ReportRow | null> {
  const { data, error } = await createServiceClient()
    .from("reports")
    .select("*")
    .eq("report_date", date)
    .maybeSingle<ReportRow>();
  if (error) throw new Error(`보고서를 읽지 못했습니다: ${error.message}`);
  return data;
}

/** 한국 휴장일인가? (holidays 표) */
export async function isKrHoliday(date: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("holidays")
    .select("holiday_date")
    .eq("market", "kr")
    .eq("holiday_date", date)
    .maybeSingle();
  if (error) throw new Error(`휴장일을 읽지 못했습니다: ${error.message}`);
  return data !== null;
}

/** date 주변(앞뒤 3주)의 한국 휴장일 모음. 전일·다음 영업일 이동에 쓴다. */
export async function fetchKrHolidaysAround(date: string): Promise<{ market: string; holiday_date: string }[]> {
  const { data, error } = await createServiceClient()
    .from("holidays")
    .select("market, holiday_date")
    .eq("market", "kr")
    .gte("holiday_date", minusDays(date, 21))
    .lte("holiday_date", minusDays(date, -21));
  if (error) throw new Error(`휴장일을 읽지 못했습니다: ${error.message}`);
  return data ?? [];
}

export type ReportListItem = {
  date: string;
  tableStatus: "waiting" | "done" | null;
  confirmed: boolean;
};

/** 일자별 동향 목록: 국고채 값이 있는 날짜를 최근 순으로. */
export async function listReportDates(limit = 60): Promise<ReportListItem[]> {
  const client = createServiceClient();
  const rates = await client
    .from("rates")
    .select("rate_date")
    .eq("instrument", "kr3")
    .order("rate_date", { ascending: false })
    .limit(limit)
    .returns<{ rate_date: string }[]>();
  if (rates.error) throw new Error(`날짜를 읽지 못했습니다: ${rates.error.message}`);
  const dates = (rates.data ?? []).map((row) => row.rate_date);
  if (dates.length === 0) return [];

  const reports = await client
    .from("reports")
    .select("report_date, table_status, confirmed_at")
    .in("report_date", dates)
    .returns<{ report_date: string; table_status: "waiting" | "done"; confirmed_at: string | null }[]>();
  if (reports.error) throw new Error(`보고서를 읽지 못했습니다: ${reports.error.message}`);
  const byDate = new Map((reports.data ?? []).map((row) => [row.report_date, row]));
  return dates.map((date) => ({
    date,
    tableStatus: byDate.get(date)?.table_status ?? null,
    confirmed: byDate.get(date)?.confirmed_at != null,
  }));
}

export type HeldRate = {
  id: number;
  rate_date: string;
  instrument: Instrument;
  rate: number;
  source: string;
};

/** 아직 풀리지 않은 보류 값 목록(담당자 확인 화면). */
export async function listHeldRates(): Promise<HeldRate[]> {
  const { data, error } = await createServiceClient()
    .from("rates")
    .select("id, rate_date, instrument, rate, source")
    .eq("held", true)
    .order("rate_date", { ascending: false })
    .limit(50)
    .returns<(Omit<HeldRate, "rate"> & { rate: number | string })[]>();
  if (error) throw new Error(`보류 값을 읽지 못했습니다: ${error.message}`);
  return (data ?? []).map((row) => ({ ...row, rate: Number(row.rate) }));
}

/** 보류를 풀어 준다. 누가 언제 풀었는지 남긴다. 풀 보류가 없으면 false. */
export async function releaseHeldRate(id: number, userId: number): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("rates")
    .update({
      held: false,
      held_released_by: userId,
      held_released_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("held", true)
    .select("id");
  if (error) throw new Error(`보류를 풀지 못했습니다: ${error.message}`);
  return (data ?? []).length > 0;
}
