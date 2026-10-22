// Design Ref: §2.1 ①④ 영업일 확인과 기준값 찾기, §1.2 보고서 제목
// Plan 작업 2: 영업일 계산과 보고서 제목 `M/D(요일) 국채시장 동향` 자동 생성
//
// 날짜는 "YYYY-MM-DD" 문자열로만 다룬다. 시간대 때문에 하루씩 밀리지 않도록
// 내부에서는 항상 UTC 날짜 계산만 쓴다.
// 휴장일은 호출하는 쪽에서 holidays 표(작업 1)에서 읽어 Set으로 넘겨준다.

export type DateString = string;

/** 휴장일 모음. 주말은 자동으로 쉬는 날이므로 넣지 않아도 된다. */
export type HolidaySet = ReadonlySet<DateString>;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD"를 UTC 날짜로 바꾼다. 형식이 틀리거나 없는 날짜면 오류를 낸다. */
function parseDate(date: DateString): Date {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // 2026-02-30처럼 없는 날짜는 다른 날로 넘어가므로 다시 문자열로 비교해 걸러낸다.
  if (formatDate(parsed) !== date) {
    throw new Error(`존재하지 않는 날짜입니다: ${date}`);
  }
  return parsed;
}

/** UTC 날짜를 "YYYY-MM-DD"로 바꾼다. */
function formatDate(date: Date): DateString {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 날짜에서 days일을 더하거나 뺀다. */
function addDays(date: DateString, days: number): DateString {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDate(parsed);
}

/** 한국 시간 기준 오늘 날짜. 서버가 어느 나라에 있든 한국 날짜로 맞춘다. */
export function todayInKorea(now: Date = new Date()): DateString {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return formatDate(kst);
}

/** 영업일인가? 토·일과 휴장일은 영업일이 아니다. */
export function isBusinessDay(date: DateString, holidays: HolidaySet): boolean {
  const weekday = parseDate(date).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(date);
}

/** 직전 영업일. PRD 5번 규칙: "전일"은 직전 영업일이다. */
export function previousBusinessDay(
  date: DateString,
  holidays: HolidaySet,
): DateString {
  let cursor = addDays(date, -1);
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

/** 기준일이 속한 달의 "직전 달" 마지막 영업일. 전월말 값의 기준일이다. */
export function lastBusinessDayOfPreviousMonth(
  date: DateString,
  holidays: HolidaySet,
): DateString {
  const parsed = parseDate(date);
  // 이번 달 1일의 하루 전 = 지난달 마지막 날
  const firstOfMonth = formatDate(
    new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)),
  );
  let cursor = addDays(firstOfMonth, -1);
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

/** 기준일이 속한 해의 "직전 연도" 마지막 영업일. 전년말 값의 기준일이다. */
export function lastBusinessDayOfPreviousYear(
  date: DateString,
  holidays: HolidaySet,
): DateString {
  const year = parseDate(date).getUTCFullYear();
  let cursor = `${String(year - 1).padStart(4, "0")}-12-31`;
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

/** 보고서 제목. 예: "10/22(목) 국채시장 동향" (월·일 앞에 0을 붙이지 않는다) */
export function reportTitle(date: DateString): string {
  const parsed = parseDate(date);
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const weekday = WEEKDAY_KO[parsed.getUTCDay()];
  return `${month}/${day}(${weekday}) 국채시장 동향`;
}

/** holidays 표에서 읽은 줄들 중 한 시장의 휴장일만 Set으로 만든다. (시장별로 따로 넘겨서 계산한다) */
export function toHolidaySet(
  rows: ReadonlyArray<{ market: string; holiday_date: DateString }>,
  market: string,
): HolidaySet {
  return new Set(
    rows.filter((row) => row.market === market).map((row) => row.holiday_date),
  );
}
