// Design Ref: §2.1 ⑥ 이상값 점검 + §3 보류는 값(rates 한 줄) 단위
// Plan 작업 9: 하루 수집 때 전일 대비 크게 어긋난 값은 "보류"로 저장해 화면에 "확인 중"으로 보이게 한다.
//
// 담당자가 이미 풀어 준 값(held_released_at이 있고 값이 같다)은 다시 수집돼도 보류로 되돌리지 않는다.
// 값이 달라지면 풀어 준 기록을 지우고 처음부터 다시 판단한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOutlier } from "../calc/outlier.ts";
import type { RateUpsert } from "./store.ts";

export type FlaggedRate = RateUpsert & {
  held: boolean;
  held_released_by: number | null;
  held_released_at: string | null;
};

/** rates 줄들에 보류 여부를 붙인다. 전일 값과 기존 저장 상태는 데이터베이스에서 읽는다. */
export async function flagOutliers(
  client: SupabaseClient,
  rates: readonly RateUpsert[],
): Promise<FlaggedRate[]> {
  const flagged: FlaggedRate[] = [];
  for (const rate of rates) {
    // 같은 종목의 바로 전 값
    const previous = await client
      .from("rates")
      .select("rate")
      .eq("instrument", rate.instrument)
      .lt("rate_date", rate.rate_date)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle<{ rate: number | string }>();
    if (previous.error) throw new Error(`전일 값을 읽지 못했습니다: ${previous.error.message}`);

    // 이미 저장돼 있고 담당자가 풀어 준 값인지
    const existing = await client
      .from("rates")
      .select("rate, held_released_at, held_released_by")
      .eq("instrument", rate.instrument)
      .eq("rate_date", rate.rate_date)
      .maybeSingle<{
        rate: number | string;
        held_released_at: string | null;
        held_released_by: number | null;
      }>();
    if (existing.error) throw new Error(`기존 값을 읽지 못했습니다: ${existing.error.message}`);

    const alreadyReleased =
      existing.data !== null &&
      existing.data.held_released_at !== null &&
      Number(existing.data.rate) === rate.rate;
    if (alreadyReleased) {
      // 풀어 준 값 그대로: 보류로 되돌리지 않고 풀어 준 기록도 그대로 실어 보낸다.
      // (한꺼번에 저장할 때 칸이 빠지면 비워질 수 있어서, 모든 줄이 같은 칸을 갖게 한다)
      flagged.push({
        ...rate,
        held: false,
        held_released_by: existing.data!.held_released_by,
        held_released_at: existing.data!.held_released_at,
      });
      continue;
    }

    const previousRate = previous.data ? Number(previous.data.rate) : null;
    flagged.push({
      ...rate,
      held: isOutlier(rate.rate, previousRate),
      // 값이 바뀌었거나 처음이면 풀어 준 기록을 지운다.
      held_released_by: null,
      held_released_at: null,
    });
  }
  return flagged;
}
