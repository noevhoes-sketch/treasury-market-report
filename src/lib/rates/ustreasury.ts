// Design Ref: §2.1 ③ 미국 10년 금리 수집 — 미국 재무부 일별 수익률(Daily Treasury Par Yield Curve Rates)
// Plan 작업 5: 미국 재무부 10년 수집 + 값 검증
//
// 미국 자료는 미국 날짜 기준이라, 저장할 때 rate_date를 "재무부 자료의 날짜"로 쓴다.
// (한국 날짜 10/22 보고서의 "금일" 미국 값은 10/22 이전 가장 최근 미국 영업일 값이다)

import { isValidDateString, parseRateText, usDateToIso } from "./validate.ts";

export const US_SOURCE_NAME = "미국 재무부";

export type UsTenYearRow = {
  /** 재무부 자료의 날짜 (YYYY-MM-DD) */
  date: string;
  /** 10년물 금리(%) */
  rate: number;
};

/** 가져올 연도를 정수로 제한한다. 사용자가 주소를 끼워 넣을 수 없게 연도만 받는다. */
function treasuryCsvUrl(year: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`연도가 올바르지 않습니다: ${year}`);
  }
  return (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/" +
    `daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve` +
    `&field_tdr_date_value=${year}&page&_format=csv`
  );
}

/** CSV 한 줄을 쉼표로 나눈다. 값이 따옴표로 감싸져 있어도 처리한다. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * 재무부 CSV에서 날짜와 10년물 금리만 뽑는다.
 * 열 이름("10 Yr")으로 찾아서 열 순서가 바뀌어도 맞고, 열이 없으면 오류를 낸다.
 * 날짜나 금리가 틀린 줄은 건너뛴다(추정해서 채우지 않는다). 건너뛴 줄 수도 함께 돌려준다.
 */
export function parseTreasuryCsv(csv: string): {
  rows: UsTenYearRow[];
  skipped: number;
} {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error("재무부 자료가 비어 있습니다.");

  const header = splitCsvLine(lines[0]);
  const dateColumn = header.indexOf("Date");
  const tenYearColumn = header.indexOf("10 Yr");
  if (dateColumn < 0 || tenYearColumn < 0) {
    throw new Error("재무부 자료의 열 이름이 달라졌습니다. (Date, 10 Yr 열을 찾지 못함)");
  }

  const rows: UsTenYearRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = usDateToIso(cells[dateColumn] ?? "");
    const rate = parseRateText(cells[tenYearColumn]);
    if (date === null || rate === null || !isValidDateString(date)) {
      skipped += 1;
      continue;
    }
    rows.push({ date, rate });
  }
  return { rows, skipped };
}

/** 한 해치 10년물 금리를 가져온다. 주소는 연도만 바뀌는 고정된 재무부 주소다. */
export async function fetchTreasuryTenYear(
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: UsTenYearRow[]; skipped: number }> {
  const response = await fetchImpl(treasuryCsvUrl(year), {
    headers: { "User-Agent": "Mozilla/5.0" },
    // 자료가 하루에 한 번만 바뀌므로 서버 캐시 없이 매번 새로 받는다.
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`재무부 자료를 받지 못했습니다. (상태 ${response.status})`);
  }
  return parseTreasuryCsv(await response.text());
}

/** 기준 날짜(포함) 이전의 가장 최근 미국 자료. 보고서의 "금일 미국 값"을 고를 때 쓴다. 없으면 null. */
export function latestOnOrBefore(
  rows: readonly UsTenYearRow[],
  date: string,
): UsTenYearRow | null {
  let best: UsTenYearRow | null = null;
  for (const row of rows) {
    if (row.date <= date && (best === null || row.date > best.date)) best = row;
  }
  return best;
}
