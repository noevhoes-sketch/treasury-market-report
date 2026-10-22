// Design Ref: §2.1 금리 표 만들기(자동, 장 마감 후) ② 국고채 ③ 미국 ⑥ 이상값 ⑦ 저장
// Plan 작업 11: 자동 실행 주소와 확인 스크립트가 함께 쓰는 "하루 수집" 한 번의 흐름.
// 여러 번 불러도 안전하다(같은 값이면 결과가 같고, 담당자가 풀어 준 보류와 직접 입력 값은 지킨다).

import type { SupabaseClient } from "@supabase/supabase-js";
import { flagOutliers } from "./flag.ts";
import { fetchKofiaDay, type KofiaDayStatus } from "./kofia.ts";
import { kofiaYieldsToRates, upsertHolidays, upsertRates, usRowsToRates } from "./store.ts";
import { fetchTreasuryTenYear } from "./ustreasury.ts";
import { syncTableStatus } from "../reports/table-status.ts";

/** 금투협 자료가 없어 자동으로 적은 휴장일의 이름. 나중에 자료가 올라오면(일시 장애였으면) 이 이름의 줄만 지운다. */
export const AUTO_HOLIDAY_NAME = "휴장일(금투협 자료 없음, 자동 확인)";

export type CollectDailyResult = {
  date: string;
  /** 금투협: ok 오후 값 수집, waiting 공시 전, no-data 자료 없음(휴장일 등) */
  kr: KofiaDayStatus;
  krSaved: number;
  krHeld: number;
  krRejected: string[];
  /** 미국: 저장한 줄 수와 가장 최근 자료 날짜 (실패하면 오류 문구) */
  us: { saved: number; latestDate: string | null; held: number } | { error: string };
  /** 금리 표 상태: 국고채 3개가 모두 모이면 done */
  tableStatus: "waiting" | "done";
};

/** 오늘(한국 날짜) 값을 받아 저장한다. fetchImpl은 확인용으로 바꿔 끼울 수 있다. */
export async function collectDaily(
  client: SupabaseClient,
  today: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CollectDailyResult> {
  // 1) 금투협 국고채 (오후 값이 있을 때만 저장)
  const kofia = await fetchKofiaDay(today, fetchImpl);
  const krFlagged = await flagOutliers(client, kofiaYieldsToRates(today, kofia.yields));
  const krSaved = await upsertRates(client, krFlagged);

  // 휴장일 기록: 평일인데 금투협 자료가 아예 없으면 휴장일로 적는다(임시공휴일도 자동으로 반영된다). 일시 장애였다면 자료가 올라온 뒤 자동으로 지운다.
  if (kofia.status === "no-data") {
    await upsertHolidays(client, [{ market: "kr", holiday_date: today, name: AUTO_HOLIDAY_NAME }]);
  } else {
    const { error } = await client
      .from("holidays")
      .delete()
      .eq("market", "kr")
      .eq("holiday_date", today)
      .eq("name", AUTO_HOLIDAY_NAME);
    if (error) throw new Error(`휴장일 기록을 정리하지 못했습니다: ${error.message}`);
  }

  // 2) 미국 재무부: 한쪽이 실패해도 국고채 결과는 지킨다. 최근 일주일치만 다시 저장한다.
  let us: CollectDailyResult["us"];
  try {
    // 1월에는 전년 자료도 함께 받는다: 미국 12/31 값은 한국 시간으로 1월에 나오므로, 올해 자료만 받으면 "전년말" 값이 빠진다.
    const year = Number(today.slice(0, 4));
    const years = today.slice(5, 7) === "01" ? [year, year - 1] : [year];
    // 전년 자료를 못 받아도 올해 자료는 저장한다.
    const rows = (
      await Promise.all(
        years.map((y, i) =>
          fetchTreasuryTenYear(y, fetchImpl).then(
            (result) => result.rows,
            (error) => {
              if (i === 0) throw error;
              return [];
            },
          ),
        ),
      )
    ).flat();
    const recent = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
    const flagged = await flagOutliers(client, usRowsToRates(recent));
    const saved = await upsertRates(client, flagged);
    us = {
      saved,
      latestDate: recent[0]?.date ?? null,
      held: flagged.filter((row) => row.held).length,
    };
  } catch (error) {
    us = { error: error instanceof Error ? error.message : "미국 자료를 받지 못했습니다." };
  }

  // 3) 보고서 한 건과 금리 표 상태. 저장된 국고채 값이 3개 모두 있으면(직접 입력한 값 포함) 완료, 완료된 표를 대기로 되돌리지 않는다.
  // 휴장일(자료 없음)이면 보고서 행을 만들지 않는다.
  const tableStatus = kofia.status === "no-data" ? "waiting" : await syncTableStatus(client, today);

  return {
    date: today,
    kr: kofia.status,
    krSaved,
    krHeld: krFlagged.filter((row) => row.held).length,
    krRejected: kofia.rejected.map((item) => `${item.instrument}: ${item.reason}`),
    us,
    tableStatus,
  };
}
