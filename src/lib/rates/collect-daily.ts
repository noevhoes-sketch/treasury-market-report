// Design Ref: §2.1 금리 표 만들기(자동, 장 마감 후) ② 국고채 ③ 미국 ⑥ 이상값 ⑦ 저장
// Plan 작업 11: 자동 실행 주소와 확인 스크립트가 함께 쓰는 "하루 수집" 한 번의 흐름.
// 여러 번 불러도 안전하다(같은 값이면 결과가 같고, 담당자가 풀어 준 보류와 직접 입력 값은 지킨다).

import type { SupabaseClient } from "@supabase/supabase-js";
import { flagOutliers } from "./flag.ts";
import { fetchKofiaDay, type KofiaDayStatus } from "./kofia.ts";
import { kofiaYieldsToRates, upsertRates, usRowsToRates } from "./store.ts";
import { fetchTreasuryTenYear } from "./ustreasury.ts";
import { syncTableStatus } from "../reports/table-status.ts";

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

  // 2) 미국 재무부: 한쪽이 실패해도 국고채 결과는 지킨다. 최근 일주일치만 다시 저장한다.
  let us: CollectDailyResult["us"];
  try {
    const { rows } = await fetchTreasuryTenYear(Number(today.slice(0, 4)), fetchImpl);
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
  const tableStatus = await syncTableStatus(client, today);

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
