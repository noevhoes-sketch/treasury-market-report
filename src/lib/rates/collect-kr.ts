// Design Ref: §2.1 ② 국고채 수집 + §2.6 시작값 채우기(국고채 줄), §3 휴장일 자료
// Plan 작업 6·7: 금투협 최종호가수익률을 받아 rates에 저장하고, 자료가 없는 평일은 한국 휴장일로 기록한다.
//
// 금투협이 "그날 자료 없음"(0건)을 돌려주는 평일은 휴장일로 본다. 그래서 휴장일 자료의 출처가 따로 필요 없다.
// 다만 일시적 장애와 구분할 수 없으므로 이름에 근거를 적어 두고, 오늘 날짜는 휴장일로 기록하지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchKofiaDay, type KofiaDayResult } from "./kofia.ts";
import { kofiaYieldsToRates, upsertHolidays, upsertRates } from "./store.ts";

export const KR_HOLIDAY_NAME = "휴장일(금투협 자료 없음)";

export type CollectKrDayResult = KofiaDayResult & {
  /** 저장한 금리 줄 수 */
  saved: number;
};

/** 하루치를 받아 검증을 통과한 국고채 금리만 저장한다. 값이 틀린 종목은 저장하지 않는다("미수집"). */
export async function collectKofiaDay(
  client: SupabaseClient,
  date: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CollectKrDayResult> {
  const result = await fetchKofiaDay(date, fetchImpl);
  const saved = await upsertRates(client, kofiaYieldsToRates(date, result.yields));
  return { ...result, saved };
}

/** 두 날짜(포함) 사이의 평일(월~금) 날짜 목록. */
export function weekdaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

export type BackfillKrResult = {
  /** 저장한 금리 줄 수 */
  saved: number;
  /** 자료가 있었던 날 수 */
  tradingDays: number;
  /** 휴장일로 기록한 날 수 */
  holidays: number;
  /** 오후 값이 아직 없어 건너뛴 날 수(오늘 등) */
  waiting: number;
  /** 검증에서 걸러진 값 */
  rejected: { date: string; instrument: string; reason: string }[];
};

/**
 * from~to 사이 평일을 하루씩 조회해 저장한다. (시작값 채우기)
 * 서버에 부담을 주지 않도록 요청 사이에 delayMs만큼 쉰다.
 * today보다 이후 날짜와 today 자신은 휴장일로 기록하지 않는다.
 */
export async function backfillKofia(
  client: SupabaseClient,
  from: string,
  to: string,
  options: {
    today: string;
    fetchImpl?: typeof fetch;
    delayMs?: number;
    onProgress?: (date: string, status: string) => void;
  },
): Promise<BackfillKrResult> {
  const { today, fetchImpl = fetch, delayMs = 150, onProgress } = options;
  const summary: BackfillKrResult = {
    saved: 0,
    tradingDays: 0,
    holidays: 0,
    waiting: 0,
    rejected: [],
  };
  const holidayRows: { market: "kr"; holiday_date: string; name: string }[] = [];

  for (const date of weekdaysBetween(from, to)) {
    const result = await collectKofiaDay(client, date, fetchImpl);
    summary.saved += result.saved;
    for (const item of result.rejected) {
      summary.rejected.push({ date, instrument: item.instrument, reason: item.reason });
    }
    if (result.status === "ok") summary.tradingDays += 1;
    else if (result.status === "waiting") summary.waiting += 1;
    else if (date < today) {
      holidayRows.push({ market: "kr", holiday_date: date, name: KR_HOLIDAY_NAME });
    }
    onProgress?.(date, result.status);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  summary.holidays = await upsertHolidays(client, holidayRows);
  return summary;
}
