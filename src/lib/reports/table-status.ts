// Design Ref: §2.1 금리 표 상태 대기 → 완료, CHECK.md 1순위 4번
// 국고채 3·10·30년 값이 모두 모였으면 그날 보고서의 금리 표 상태를 "완료"로 올린다. 자동 수집으로 모였든 담당자가 직접 넣었든 같다.
// (확정은 표 상태가 "완료"일 때만 할 수 있다. 직접 입력만으로도 확정할 수 있어야 금투협이 막힌 날을 넘길 수 있다)
// 연결(client)을 받아서 쓰므로 서버 전용 코드와 확인 스크립트가 함께 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";

export const KR_INSTRUMENTS = ["kr3", "kr10", "kr30"] as const;

/** 그날 국고채 값이 모두 있으면 표 상태를 "완료"로 만든다. 모이지 않았으면 보고서가 없을 때만 "대기"로 만들고, 이미 있는 상태는 그대로 둔다. */
export async function syncTableStatus(client: SupabaseClient, date: string): Promise<"waiting" | "done"> {
  const { data, error } = await client
    .from("rates")
    .select("instrument")
    .eq("rate_date", date)
    .in("instrument", [...KR_INSTRUMENTS]);
  if (error) throw new Error(`금리 개수를 읽지 못했습니다: ${error.message}`);
  const have = new Set((data ?? []).map((row: { instrument: string }) => row.instrument));
  const complete = KR_INSTRUMENTS.every((instrument) => have.has(instrument));

  if (complete) {
    const { error: upsertError } = await client
      .from("reports")
      .upsert({ report_date: date, table_status: "done" }, { onConflict: "report_date" });
    if (upsertError) throw new Error(`보고서 상태를 저장하지 못했습니다: ${upsertError.message}`);
    return "done";
  }
  const { error: waitError } = await client
    .from("reports")
    .upsert({ report_date: date, table_status: "waiting" }, { onConflict: "report_date", ignoreDuplicates: true });
  if (waitError) throw new Error(`보고서를 만들지 못했습니다: ${waitError.message}`);
  return "waiting";
}
