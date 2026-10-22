// Design Ref: §2.1 ③ 미국 10년 수집 + §2.6 시작값 채우기(미국 줄)
// Plan 작업 5·7: 올해와 지난해 재무부 자료를 받아 rates에 저장한다.
// 지난해 마지막 영업일 값(전년말)과 지난달 마지막 영업일 값(전월말)이 이 자료 안에 들어 있어서,
// 매일 수집과 시작값 채우기가 같은 함수로 된다. 여러 번 실행해도 같은 값이면 결과가 같다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertRates, usRowsToRates } from "./store.ts";
import { fetchTreasuryTenYear } from "./ustreasury.ts";

export type CollectUsResult = {
  /** 저장한 줄 수 */
  saved: number;
  /** 형식이 틀려서 건너뛴 줄 수 */
  skipped: number;
  /** 저장한 가장 최근 자료의 날짜 */
  latestDate: string | null;
};

/** years에 적은 연도의 미국 10년 금리를 받아 저장한다. */
export async function collectUsTenYear(
  client: SupabaseClient,
  years: readonly number[],
  fetchImpl: typeof fetch = fetch,
): Promise<CollectUsResult> {
  let saved = 0;
  let skipped = 0;
  let latestDate: string | null = null;
  for (const year of years) {
    const { rows, skipped: skippedInYear } = await fetchTreasuryTenYear(year, fetchImpl);
    skipped += skippedInYear;
    saved += await upsertRates(client, usRowsToRates(rows));
    for (const row of rows) {
      if (latestDate === null || row.date > latestDate) latestDate = row.date;
    }
  }
  return { saved, skipped, latestDate };
}
