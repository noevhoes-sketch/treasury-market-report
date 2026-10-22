// Design Ref: §1.2 보고서 화면 — 한 보고서에 필요한 금리 줄만 읽는다
// 연결(client)을 받아서 쓰므로 서버 전용 코드(화면)와 자동 실행·확인 스크립트가 함께 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { endOfPreviousMonth, endOfPreviousYear, type RateRecord } from "../calc/report-table.ts";
import type { Instrument } from "../db/types.ts";

type RateDbRow = {
  rate_date: string;
  instrument: Instrument;
  rate: number | string;
  source: string;
  as_of_date: string;
  held: boolean;
};

/** date에서 days일 전 날짜(달력). */
export function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 한 보고서에 필요한 금리 줄만 읽는다: 보고서 날짜 근처, 지난달 말 근처, 지난해 말 근처.
 * (한 해치를 모두 읽으면 한 번에 읽을 수 있는 줄 수 제한(1000줄)을 넘길 수 있어서 세 구간만 읽는다)
 * 구간을 14일로 잡은 이유: 긴 연휴에도 그 앞의 마지막 영업일 값이 구간 안에 들어오게 하려는 것이다.
 */
export async function fetchRatesForReportWith(
  client: SupabaseClient,
  date: string,
): Promise<RateRecord[]> {
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
      records.set(`${row.instrument}|${row.rate_date}`, { ...row, rate: Number(row.rate) });
    }
  }
  return [...records.values()];
}
