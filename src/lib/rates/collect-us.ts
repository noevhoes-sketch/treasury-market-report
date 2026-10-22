// Design Ref: §2.1 ③ 미국 10년 수집 + §2.6 시작값 채우기(미국 줄), §3 휴장일 자료(미국)
// Plan 작업 5·7: 올해와 지난해 재무부 자료를 받아 rates에 저장한다.
// 지난해 마지막 영업일 값(전년말)과 지난달 마지막 영업일 값(전월말)이 이 자료 안에 들어 있어서,
// 매일 수집과 시작값 채우기가 같은 함수로 된다. 여러 번 실행해도 같은 값이면 결과가 같다.
// 재무부 자료가 없는 평일(첫 날~마지막 날 사이)은 미국 휴장일로 기록한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { weekdaysBetween } from "./collect-kr.ts";
import { upsertHolidays, upsertRates, usRowsToRates } from "./store.ts";
import { fetchTreasuryTenYear, type UsTenYearRow } from "./ustreasury.ts";

export const US_HOLIDAY_NAME = "휴장일(재무부 자료 없음)";

export type CollectUsResult = {
  /** 저장한 줄 수 */
  saved: number;
  /** 형식이 틀려서 건너뛴 줄 수 */
  skipped: number;
  /** 저장한 가장 최근 자료의 날짜 */
  latestDate: string | null;
  /** 휴장일로 기록한 날 수 */
  holidays: number;
};

/**
 * 받은 자료의 첫 날~마지막 날 사이에 자료가 없는 평일을 미국 휴장일로 본다.
 * 마지막 날 이후는 아직 오지 않은 날일 수 있어서 포함하지 않는다.
 */
export function usHolidaysFromRows(rows: readonly UsTenYearRow[]) {
  if (rows.length === 0) return [];
  const dates = rows.map((row) => row.date).sort();
  const have = new Set(dates);
  return weekdaysBetween(dates[0], dates[dates.length - 1])
    .filter((date) => !have.has(date))
    .map((date) => ({ market: "us" as const, holiday_date: date, name: US_HOLIDAY_NAME }));
}

/** years에 적은 연도의 미국 10년 금리를 받아 저장한다. */
export async function collectUsTenYear(
  client: SupabaseClient,
  years: readonly number[],
  fetchImpl: typeof fetch = fetch,
): Promise<CollectUsResult> {
  let saved = 0;
  let skipped = 0;
  let latestDate: string | null = null;
  const allRows: UsTenYearRow[] = [];
  for (const year of years) {
    const { rows, skipped: skippedInYear } = await fetchTreasuryTenYear(year, fetchImpl);
    skipped += skippedInYear;
    saved += await upsertRates(client, usRowsToRates(rows));
    allRows.push(...rows);
    for (const row of rows) {
      if (latestDate === null || row.date > latestDate) latestDate = row.date;
    }
  }
  const holidays = await upsertHolidays(client, usHolidaysFromRows(allRows));
  return { saved, skipped, latestDate, holidays };
}
