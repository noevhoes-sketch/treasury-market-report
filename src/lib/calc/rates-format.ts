// Design Ref: §2.1 ⑤ 변동폭 계산(bp, 소수 첫째 자리), PRD 5번 표시 규칙
// Plan 작업 3: 변동폭 계산과 표시 규칙(소수 자릿수, "미수집", 출처·기준일 표기)
//
// 화면과 한글 파일이 같은 규칙을 쓰도록 계산·표시를 이 파일 한 곳에 모은다.
// 값이 없으면 추정해서 채우지 않고 "미수집"으로 표시한다.
// (db/types는 타입만 가져온다. 그래서 확인 스크립트에서 이 파일을 바로 실행할 수 있다)

import type { DateString, Instrument } from "../db/types";

/** 값이 없을 때 칸에 쓰는 문구 (PRD 5번 규칙) */
export const MISSING_TEXT = "미수집";
/** 이상값이라 보류 중인 칸에 쓰는 문구 (DESIGN §1.2) */
export const HELD_TEXT = "확인 중";

/** 표에 들어가는 종목 순서 */
export const TABLE_ORDER: readonly Instrument[] = ["kr3", "kr10", "kr30", "us10"];

/** 기준일별 금리 한 칸의 입력값. 아직 못 받았으면 null */
export type RateInput = {
  /** 출처 값 그대로의 금리(%) */
  rate: number;
  /** 출처 이름 */
  source: string;
  /** 출처의 기준일 */
  asOf: DateString;
  /** 이상값이라 보류 중인가 */
  held?: boolean;
} | null;

/** 한 종목의 네 기준일 금리 */
export type InstrumentInput = {
  /** 금일 */
  today: RateInput;
  /** 전일(직전 영업일) */
  previousDay: RateInput;
  /** 전월말(직전 월 마지막 영업일) */
  previousMonthEnd: RateInput;
  /** 전년말(직전 연도 마지막 영업일) */
  previousYearEnd: RateInput;
};

/** 화면에 그대로 쓸 한 칸. 금리 칸이면 출처·기준일도 함께 가진다. */
export type Cell = {
  text: string;
  source: string | null;
  asOf: DateString | null;
};

export type TableRow = {
  instrument: Instrument;
  today: Cell;
  previousDay: Cell;
  previousMonthEnd: Cell;
  previousYearEnd: Cell;
  /** 전년말비 */
  changeFromYearEnd: Cell;
  /** 전월말비 */
  changeFromMonthEnd: Cell;
  /** 전일비 */
  changeFromPreviousDay: Cell;
};

/** 금리를 소수 셋째 자리까지 문자열로. 예: 3.822 → "3.822", 값이 없으면 "미수집" */
export function formatRate(rate: number | null): string {
  if (rate === null) return MISSING_TEXT;
  return rate.toFixed(3);
}

/**
 * 변동폭(bp)을 부호와 함께 소수 첫째 자리까지 문자열로.
 * 예: 1.8 → "+1.8bp", -0.5 → "-0.5bp", 0 → "0.0bp", 값이 없으면 "미수집"
 */
export function formatChange(bp: number | null): string {
  if (bp === null) return MISSING_TEXT;
  const text = Math.abs(bp).toFixed(1);
  if (text === "0.0") return "0.0bp";
  return `${bp > 0 ? "+" : "-"}${text}bp`;
}

/**
 * 변동폭(bp) = (금일 - 기준일) 금리차 × 100. 소수 첫째 자리까지.
 * 금리는 소수 셋째 자리까지라서 1000배한 정수로 빼면 부동소수점 오차가 생기지 않는다.
 * 한쪽이라도 없으면 null (추정하지 않는다).
 */
export function changeInBp(
  current: number | null,
  base: number | null,
): number | null {
  if (current === null || base === null) return null;
  const diffThousandths = Math.round(current * 1000) - Math.round(base * 1000);
  // 1000분의 1%p = 0.1bp
  return diffThousandths / 10;
}

function rateCell(input: RateInput): Cell {
  if (input === null) return { text: MISSING_TEXT, source: null, asOf: null };
  if (input.held) {
    return { text: HELD_TEXT, source: input.source, asOf: input.asOf };
  }
  return {
    text: formatRate(input.rate),
    source: input.source,
    asOf: input.asOf,
  };
}

/** 변동폭 칸. 금일이나 기준일 값이 없거나 보류 중이면 그 사실을 그대로 보여준다. */
function changeCell(today: RateInput, base: RateInput): Cell {
  if (today?.held || base?.held) {
    return { text: HELD_TEXT, source: null, asOf: null };
  }
  const bp = changeInBp(today?.rate ?? null, base?.rate ?? null);
  return { text: formatChange(bp), source: null, asOf: null };
}

/** 종목 한 줄을 만든다. */
export function buildTableRow(
  instrument: Instrument,
  input: InstrumentInput,
): TableRow {
  return {
    instrument,
    today: rateCell(input.today),
    previousDay: rateCell(input.previousDay),
    previousMonthEnd: rateCell(input.previousMonthEnd),
    previousYearEnd: rateCell(input.previousYearEnd),
    changeFromYearEnd: changeCell(input.today, input.previousYearEnd),
    changeFromMonthEnd: changeCell(input.today, input.previousMonthEnd),
    changeFromPreviousDay: changeCell(input.today, input.previousDay),
  };
}

/** 금리 표 전체를 만든다. 입력에 없는 종목은 모두 "미수집"인 줄이 된다. */
export function buildReportTable(
  inputs: Partial<Record<Instrument, InstrumentInput>>,
): TableRow[] {
  const empty: InstrumentInput = {
    today: null,
    previousDay: null,
    previousMonthEnd: null,
    previousYearEnd: null,
  };
  return TABLE_ORDER.map((instrument) =>
    buildTableRow(instrument, inputs[instrument] ?? empty),
  );
}
