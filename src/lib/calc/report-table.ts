// Design Ref: §2.1 ④ 전일·전월말·전년말 기준값 찾기, §3 "기준 날짜 이전 가장 최근 값을 찾아 쓴다"
// Plan 작업 8: 금리 표 화면에 넣을 기준값을 rates 줄들에서 고른다. (순수 계산이라 데이터베이스 없이 확인할 수 있다)
//
// 규칙
//  - 국고채: 보고서 날짜의 값이 "금일"이다. 그날 값이 아직 없으면 금일은 비운다("미수집/대기 중").
//  - 미국: 보고서 날짜 이전 가장 최근 미국 영업일 값이 "금일"이다(최신 마감일 값).
//  - 전일: 금일 값의 날짜보다 앞선 가장 최근 값. 전월말·전년말: 보고서 날짜 기준 지난달·지난해 마지막 날 이전의 가장 최근 값.
//    휴장일 표를 따로 보지 않아도, 값이 있는 날만 골라서 영업일이 저절로 맞는다.

import type { Instrument } from "../db/types";
import type { InstrumentInput, RateInput } from "./rates-format";

/** 표를 만들 때 필요한 rates 한 줄. */
export type RateRecord = {
  rate_date: string;
  instrument: Instrument;
  rate: number;
  source: string;
  as_of_date: string;
  /** 이상값이라 보류 중인가 */
  held: boolean;
};

/** 지난달 마지막 날(달력상). 예: 2026-10-22 → 2026-09-30 */
export function endOfPreviousMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, 0));
  return last.toISOString().slice(0, 10);
}

/** 지난해 마지막 날(달력상). 예: 2026-10-22 → 2025-12-31 */
export function endOfPreviousYear(date: string): string {
  return `${String(Number(date.slice(0, 4)) - 1).padStart(4, "0")}-12-31`;
}

function toInput(record: RateRecord | null): RateInput {
  if (record === null) return null;
  return {
    rate: record.rate,
    source: record.source,
    asOf: record.as_of_date,
    held: record.held,
  };
}

/** 날짜가 limit 이하인 줄 중 가장 최근 것. (inclusive가 false면 limit보다 앞선 것) */
function latest(
  records: readonly RateRecord[],
  limit: string,
  inclusive: boolean,
): RateRecord | null {
  let best: RateRecord | null = null;
  for (const record of records) {
    const ok = inclusive ? record.rate_date <= limit : record.rate_date < limit;
    if (ok && (best === null || record.rate_date > best.rate_date)) best = record;
  }
  return best;
}

/** 한 종목의 네 기준일 값을 고른다. records는 그 종목의 줄만 넣는다. */
export function pickInstrumentInput(
  records: readonly RateRecord[],
  reportDate: string,
  market: "kr" | "us",
): InstrumentInput {
  const today =
    market === "kr"
      ? (records.find((record) => record.rate_date === reportDate) ?? null)
      : latest(records, reportDate, true);
  // 금일 값이 없으면 보고서 날짜를 기준으로 전일을 찾는다.
  const anchor = today?.rate_date ?? reportDate;
  return {
    today: toInput(today),
    previousDay: toInput(latest(records, anchor, false)),
    previousMonthEnd: toInput(latest(records, endOfPreviousMonth(reportDate), true)),
    previousYearEnd: toInput(latest(records, endOfPreviousYear(reportDate), true)),
  };
}

const MARKET_OF: Record<Instrument, "kr" | "us"> = {
  kr3: "kr",
  kr10: "kr",
  kr30: "kr",
  us10: "us",
};

/** rates 줄 전체에서 종목별 입력을 만든다. */
export function pickReportInputs(
  records: readonly RateRecord[],
  reportDate: string,
): Partial<Record<Instrument, InstrumentInput>> {
  const result: Partial<Record<Instrument, InstrumentInput>> = {};
  for (const instrument of Object.keys(MARKET_OF) as Instrument[]) {
    result[instrument] = pickInstrumentInput(
      records.filter((record) => record.instrument === instrument),
      reportDate,
      MARKET_OF[instrument],
    );
  }
  return result;
}
