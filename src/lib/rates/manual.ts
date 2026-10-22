// Design Ref: §1.3 담당자 확인 화면, §3 rates.is_manual — 자동 수집이 안 된 날 담당자가 금리를 직접 넣는다
// Plan 작업 16: 직접 입력한 값은 출처가 항상 "담당자 직접 입력"이고, 자동 수집이 나중에 덮어쓰지 못한다(DB 트리거).
// 연결(client)을 받아서 쓰므로 서버 전용 코드와 확인 스크립트가 함께 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MANUAL_SOURCE, type Instrument } from "../db/types.ts";
import { todayInKorea } from "../calc/business-days.ts";
import { syncTableStatus } from "../reports/table-status.ts";
import { isValidDateString, parseRateText } from "./validate.ts";

export type ManualInput = {
  /** 보고서 날짜 (국고채 값의 날짜) */
  date: string;
  /** 종목별 입력 글자. 빈 칸은 "입력 안 함". */
  values: Partial<Record<Instrument, string>>;
  /** 미국 10년 값의 기준일(미국 마감일). 미국 값을 넣을 때만 필요하다. */
  usDate?: string;
};

export type ManualResult = { ok: true; saved: number } | { ok: false; reason: string };

const NAMES: Record<Instrument, string> = {
  kr3: "국고 3년",
  kr10: "국고 10년",
  kr30: "국고 30년",
  us10: "미국 10년",
};

/** 미국 기준일로 받아들이는 범위: 보고서 날짜보다 앞이고 10일 이내 */
function usDateOk(usDate: string, reportDate: string): boolean {
  if (!isValidDateString(usDate) || usDate >= reportDate) return false;
  const diff = (Date.parse(reportDate) - Date.parse(usDate)) / 86_400_000;
  return diff <= 10;
}

/**
 * 직접 입력한 금리를 검사해서 저장한다. 하나라도 형식이 틀리면 아무것도 저장하지 않는다.
 *  - 금리는 0~20%, 소수 둘째~셋째 자리 (출처 값 그대로 쓰므로 추정하지 않는다)
 *  - 국고채는 보고서 날짜로, 미국은 입력한 미국 기준일로 저장한다
 *  - 값이 바뀌면 DB가 이미 한 확정을 풀어 준다
 *  - 미래 날짜, 주말·휴장일에는 넣을 수 없고, 이미 자동으로 수집된 값은 바꿀 수 없다(자동 수집 값은 출처 그대로여야 한다. 직접 넣은 값을 고치는 것은 가능)
 */
export async function saveManualRates(client: SupabaseClient, input: ManualInput, enteredBy?: number): Promise<ManualResult> {
  if (!isValidDateString(input.date)) return { ok: false, reason: "날짜가 올바르지 않습니다." };
  if (input.date > todayInKorea()) return { ok: false, reason: "아직 오지 않은 날짜에는 금리를 넣을 수 없어요." };
  const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return { ok: false, reason: "주말에는 보고서가 없어서 금리를 넣을 수 없어요." };
  const holiday = await client.from("holidays").select("holiday_date").eq("market", "kr").eq("holiday_date", input.date).maybeSingle();
  if (holiday.error) throw new Error(`휴장일을 읽지 못했습니다: ${holiday.error.message}`);
  if (holiday.data) return { ok: false, reason: "휴장일에는 보고서가 없어서 금리를 넣을 수 없어요." };

  const rows: {
    rate_date: string;
    instrument: Instrument;
    rate: number;
    source: string;
    as_of_date: string;
    is_manual: true;
    held: false;
    held_released_by: null;
    held_released_at: null;
    entered_by: number | null;
  }[] = [];

  for (const instrument of Object.keys(NAMES) as Instrument[]) {
    const raw = (input.values[instrument] ?? "").trim();
    if (raw === "") continue;
    const rate = parseRateText(raw);
    if (rate === null) {
      return { ok: false, reason: `${NAMES[instrument]}: 금리는 3.822처럼 숫자로 적어 주세요(0~20, 소수 둘째~셋째 자리).` };
    }
    let rateDate = input.date;
    if (instrument === "us10") {
      if (!input.usDate || !usDateOk(input.usDate, input.date)) {
        return { ok: false, reason: "미국 10년: 미국 기준일을 보고서 날짜보다 앞 10일 안으로 적어 주세요." };
      }
      rateDate = input.usDate;
    }
    rows.push({
      rate_date: rateDate,
      instrument,
      rate,
      source: MANUAL_SOURCE,
      as_of_date: rateDate,
      is_manual: true,
      held: false,
      held_released_by: null,
      held_released_at: null,
      entered_by: enteredBy ?? null,
    });
  }

  if (rows.length === 0) return { ok: false, reason: "넣을 금리를 한 칸 이상 적어 주세요." };

  // 이미 자동으로 수집된 값(직접 입력이 아닌 값)은 바꾸지 않는다.
  for (const date of new Set(rows.map((row) => row.rate_date))) {
    const instruments = rows.filter((row) => row.rate_date === date).map((row) => row.instrument);
    const existing = await client.from("rates").select("instrument, is_manual").eq("rate_date", date).in("instrument", instruments);
    if (existing.error) throw new Error(`기존 금리를 읽지 못했습니다: ${existing.error.message}`);
    const auto = ((existing.data ?? []) as { instrument: Instrument; is_manual: boolean }[]).find((row) => !row.is_manual);
    if (auto) return { ok: false, reason: `${NAMES[auto.instrument]}: 이미 자동으로 수집된 값이 있어서 직접 입력으로 바꿀 수 없어요.` };
  }

  const { error } = await client.from("rates").upsert(rows, { onConflict: "rate_date,instrument" });
  if (error) throw new Error(`직접 입력한 금리를 저장하지 못했습니다: ${error.message}`);
  // 국고채 3개가 모두 모였으면 표 상태를 "완료"로 올려 직접 입력만으로도 확정할 수 있게 한다.
  if (rows.some((row) => row.instrument !== "us10")) await syncTableStatus(client, input.date);
  return { ok: true, saved: rows.length };
}
