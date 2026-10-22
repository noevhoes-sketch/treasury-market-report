// Design Ref: §3 저장할 데이터 — rates에 금리 한 줄씩 저장한다 (같은 날·같은 종목은 한 줄만, 다시 받으면 덮어씀)
// Plan 작업 5·7: 수집한 값을 저장하는 공통 함수. 연결(client)을 받아서 쓰므로 서버 전용 코드와 확인 스크립트가 함께 쓴다.
// (데이터베이스의 규칙: 다시 받은 값이 다르면 확정이 풀리고, 담당자가 직접 넣은 값은 덮어쓰지 못한다)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Instrument } from "../db/types";
import { KOFIA_SOURCE_NAME, type KofiaYield } from "./kofia.ts";
import { US_SOURCE_NAME, type UsTenYearRow } from "./ustreasury.ts";

export type RateUpsert = {
  rate_date: string;
  instrument: Instrument;
  rate: number;
  source: string;
  as_of_date: string;
};

/** 미국 10년 자료를 rates 한 줄 모양으로 바꾼다. 날짜는 재무부 자료의 날짜 그대로 쓴다. */
export function usRowsToRates(rows: readonly UsTenYearRow[]): RateUpsert[] {
  return rows.map((row) => ({
    rate_date: row.date,
    instrument: "us10",
    rate: row.rate,
    source: US_SOURCE_NAME,
    as_of_date: row.date,
  }));
}

/** 금투협 하루치(검증을 통과한 값)를 rates 한 줄 모양으로 바꾼다. 날짜는 조회한 날짜 그대로다. */
export function kofiaYieldsToRates(
  date: string,
  yields: readonly KofiaYield[],
): RateUpsert[] {
  return yields.map((item) => ({
    rate_date: date,
    instrument: item.instrument,
    rate: item.rate,
    source: KOFIA_SOURCE_NAME,
    as_of_date: date,
  }));
}

export type HolidayUpsert = { market: "kr" | "us"; holiday_date: string; name: string };

/** holidays에 저장한다. 이미 있는 날은 이름만 덮어쓴다. */
export async function upsertHolidays(
  client: SupabaseClient,
  holidays: readonly HolidayUpsert[],
): Promise<number> {
  if (holidays.length === 0) return 0;
  const { error } = await client
    .from("holidays")
    .upsert(holidays as HolidayUpsert[], { onConflict: "market,holiday_date" });
  if (error) throw new Error(`휴장일을 저장하지 못했습니다: ${error.message}`);
  return holidays.length;
}

/** rates에 저장한다. 이미 있는 줄은 새 값으로 덮어쓴다. 저장한 줄 수를 돌려준다. */
export async function upsertRates(
  client: SupabaseClient,
  rates: readonly RateUpsert[],
): Promise<number> {
  if (rates.length === 0) return 0;
  // 한 번에 너무 많이 보내지 않도록 나눠서 저장한다.
  const CHUNK = 200;
  for (let i = 0; i < rates.length; i += CHUNK) {
    const { error } = await client
      .from("rates")
      .upsert(rates.slice(i, i + CHUNK) as RateUpsert[], {
        onConflict: "rate_date,instrument",
      });
    if (error) throw new Error(`금리를 저장하지 못했습니다: ${error.message}`);
  }
  return rates.length;
}
