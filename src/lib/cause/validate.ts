// Design Ref: §2.2 ③ 숫자와 어긋나는지, 60자를 넘는지 검사 + §4.5 기사 속 명령 무시(프롬프트 인젝션 대비)
// Plan 작업 12: AI가 쓴 원인 문장은 믿지 않고 한 번 걸러서 쓴다. 걸러지면 "근거 기사 없음"으로 처리한다.
// PRD 5번 규칙: 한 문장 60자 이내(공백 포함), 표 숫자와 어긋나지 않게, 근거 없는 이유는 쓰지 않기, 전망·투자 의견 금지.

import type { TableRow } from "../calc/rates-format.ts";

export type CauseLine = "kr" | "us";

export const CAUSE_MAX_CHARS = 60;

export type CauseCheck = { ok: true; text: string } | { ok: false; reason: string };

/** 전망·투자 의견으로 읽히는 표현(PRD: 만들지 않을 것 3번). */
const FORECAST_WORDS = /전망|예상|예측|추천|권고|유망|바람직|해야 /;
/** 기사나 AI 답에 끼어들 수 있는 명령·링크·코드 모양 */
const SUSPICIOUS = /https?:|www\.|@|<|>|`|\[[^\]]*\]\([^)]*\)|무시|지시|명령|ignore|system|prompt|instruction/i;
const UP_WORDS = /상승|올랐|오른|오르|올라|급등|반등/;
const DOWN_WORDS = /하락|내렸|내린|내려|내리|떨어|급락|하향/;
/** 어느 날 기사에나 나오는 말이라 "기사에 근거가 있는지" 판단에 쓰지 않는 말 */
const GENERIC_WORDS = new Set([
  "국고채", "국채", "금리", "하락", "상승", "마감", "시장", "전일", "대비", "미국", "미국채",
  "국고", "채권", "속에", "영향", "가운데", "으로", "에서", "했다", "하며", "되며",
]);

/** 일반적인 말(또는 그 말에 조사·어미가 붙은 꼴, 예: "금리가", "하락했다")인가? */
function isGeneric(token: string): boolean {
  for (const word of GENERIC_WORDS) {
    if (token.startsWith(word) && token.length - word.length <= 3) return true;
  }
  return false;
}

function lineRows(rows: readonly TableRow[], line: CauseLine): TableRow[] {
  return rows.filter((row) => (line === "kr" ? row.instrument.startsWith("kr") : row.instrument === "us10"));
}

function parseBp(text: string): number | null {
  const match = /([+-]?\d+(?:\.\d+)?)bp/.exec(text);
  return match ? Number(match[1]) : null;
}

/** 표의 그 줄(국고채 3줄 또는 미국 1줄)에 나온 변동폭(bp)의 절댓값 모음 */
export function allowedBpValues(rows: readonly TableRow[], line: CauseLine): number[] {
  const values: number[] = [];
  for (const row of lineRows(rows, line)) {
    for (const cell of [row.changeFromYearEnd, row.changeFromMonthEnd, row.changeFromPreviousDay]) {
      const bp = parseBp(cell.text);
      if (bp !== null) values.push(Math.abs(bp));
    }
  }
  return values;
}

/** 방향 판단에 쓰는 대표 변동폭: 국고채는 3년, 미국은 10년의 전일비 */
function primaryChange(rows: readonly TableRow[], line: CauseLine): number | null {
  const row = rows.find((r) => r.instrument === (line === "kr" ? "kr3" : "us10"));
  return row ? parseBp(row.changeFromPreviousDay.text) : null;
}

function allowedDecimals(rows: readonly TableRow[], line: CauseLine): Set<string> {
  const allowed = new Set<string>();
  for (const row of lineRows(rows, line)) {
    for (const cell of [row.today, row.previousDay, row.previousMonthEnd, row.previousYearEnd]) {
      if (/^\d/.test(cell.text)) allowed.add(cell.text);
    }
  }
  for (const bp of allowedBpValues(rows, line)) allowed.add(bp.toFixed(1));
  return allowed;
}

/** 글자 수(공백 포함). 이모지 같은 글자도 한 글자로 센다. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * AI(또는 담당자)가 쓴 원인 한 줄을 검사한다.
 * article이 있으면 문장이 그 기사에서 나왔는지(기사에 있는 말을 쓰는지)도 확인한다.
 * 담당자가 직접 고친 문장은 article 없이 길이·형식·숫자·금지 표현만 검사한다.
 */
export function validateCause(
  raw: unknown,
  line: CauseLine,
  rows: readonly TableRow[],
  articleText?: string,
): CauseCheck {
  if (typeof raw !== "string") return { ok: false, reason: "문장이 아님" };
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: "비어 있음" };
  if (/[\r\n]/.test(text)) return { ok: false, reason: "여러 줄" };
  if (charCount(text) > CAUSE_MAX_CHARS) return { ok: false, reason: `${CAUSE_MAX_CHARS}자 초과` };
  // 마침표 뒤에 공백과 다른 글이 이어지면 두 문장 이상이다. (1.8bp 같은 소수점은 해당하지 않는다)
  if (/[.!?。]\s+\S/.test(text)) return { ok: false, reason: "한 문장이 아님" };
  if (SUSPICIOUS.test(text)) return { ok: false, reason: "링크·명령·코드 모양이 들어 있음" };
  if (FORECAST_WORDS.test(text)) return { ok: false, reason: "전망·의견 표현" };

  // 숫자: 표에 없는 bp·소수는 쓰지 않는다.
  const bpAllowed = allowedBpValues(rows, line);
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*bp/g)) {
    const value = Number(match[1]);
    if (!bpAllowed.some((allowed) => Math.abs(allowed - value) < 0.05)) {
      return { ok: false, reason: `표에 없는 변동폭(${match[1]}bp)` };
    }
  }
  const decimals = allowedDecimals(rows, line);
  for (const match of text.matchAll(/\d+\.\d+/g)) {
    if (!decimals.has(match[0])) return { ok: false, reason: `표에 없는 숫자(${match[0]})` };
  }

  // 방향: 표의 전일 변동이 하락인데 문장이 오르기만 했다고 하면(또는 반대로) 어긋난 것이다.
  const change = primaryChange(rows, line);
  if (change !== null && Math.abs(change) >= 0.5) {
    const up = UP_WORDS.test(text);
    const down = DOWN_WORDS.test(text);
    if (change < 0 && up && !down) return { ok: false, reason: "표(하락)와 방향이 다름" };
    if (change > 0 && down && !up) return { ok: false, reason: "표(상승)와 방향이 다름" };
  }

  // 근거: 일반적인 말을 뺀 단어가 둘 이상 기사에 실제로 있어야 한다.
  if (articleText !== undefined) {
    const tokens = new Set(
      (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).filter((token) => !isGeneric(token) && !/^\d+$/.test(token)),
    );
    let found = 0;
    for (const token of tokens) if (articleText.includes(token)) found += 1;
    if (found < 2) return { ok: false, reason: "기사에서 근거를 찾지 못함" };
  }

  return { ok: true, text };
}
