// Design Ref: §1.2 보고서 화면, §1.4 목록, §1.3 확인 화면 — 화면이 읽고 쓰는 데이터 묶음
// 서버에서만 쓴다(server-only). 서버 전용 키로 데이터베이스를 읽으므로 화면(브라우저) 코드에서 불러오면 빌드가 실패한다.
import "server-only";

import {
  endOfPreviousMonth,
  endOfPreviousYear,
  type RateRecord,
} from "../calc/report-table";
import { createServiceClient } from "../db/server";
import type { Instrument, ReportRow } from "../db/types";

type RateDbRow = {
  rate_date: string;
  instrument: Instrument;
  rate: number | string;
  source: string;
  as_of_date: string;
  held: boolean;
};

function toRecord(row: RateDbRow): RateRecord {
  return { ...row, rate: Number(row.rate) };
}

/** date에서 days일 전 날짜(달력). */
function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 한 보고서에 필요한 금리 줄만 읽는다: 보고서 날짜 근처, 지난달 말 근처, 지난해 말 근처.
 * (한 해치를 모두 읽으면 한 번에 읽을 수 있는 줄 수 제한(1000줄)을 넘길 수 있어서 세 구간만 읽는다)
 * 구간을 14일로 잡은 이유: 긴 연휴에도 그 앞의 마지막 영업일 값이 구간 안에 들어오게 하려는 것이다.
 */
export async function fetchRatesForReport(date: string): Promise<RateRecord[]> {
  const client = createServiceClient();
  const windows = [
    [minusDays(date, 14), date],
    [minusDays(endOfPreviousMonth(date), 14), endOfPreviousMonth(date)],
    [minusDays(endOfPreviousYear(date), 14), endOfPreviousYear(date)],
  ];
  const results = await Promise.all(
    windows.map(([from, to]) =>
      client
        .from("rates")
        .select("rate_date, instrument, rate, source, as_of_date, held")
        .gte("rate_date", from)
        .lte("rate_date", to)
        .returns<RateDbRow[]>(),
    ),
  );
  const records = new Map<string, RateRecord>();
  for (const result of results) {
    if (result.error) throw new Error(`금리를 읽지 못했습니다: ${result.error.message}`);
    for (const row of result.data ?? []) {
      records.set(`${row.instrument}|${row.rate_date}`, toRecord(row));
    }
  }
  return [...records.values()];
}

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

/** 지난 보고서 목록: 국고채 값이 있는 날짜를 최근 순으로. */
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
