// Design Ref: §4.5 밖에서 가져온 값 검증 — 저장 직전에 형식·범위·날짜를 확인하고, 틀리면 저장하지 않는다("미수집")
// Plan 작업 5·6: 출처(미국 재무부, 금투협)에서 받은 값은 믿지 않고 한 번 걸러서 쓴다.

/** 금리(%)로 받아들이는 범위. 이 밖의 값은 잘못 읽은 값으로 본다. */
export const RATE_MIN = 0;
export const RATE_MAX = 20;

const RATE_PATTERN = /^\d{1,2}\.\d{2,3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 금리 문자열을 숫자로. 형식이 틀리거나(빈 값, "N/A", 쉼표, 문자 섞임) 범위 밖이면 null.
 * 한국(금투협)은 소수 셋째 자리, 미국(재무부)은 소수 둘째 자리라서 둘째~셋째 자리를 모두 받는다.
 */
export function parseRateText(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!RATE_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < RATE_MIN || value > RATE_MAX) return null;
  return value;
}

/** "YYYY-MM-DD" 모양이고 실제로 있는 날짜인가? */
export function isValidDateString(text: unknown): text is string {
  if (typeof text !== "string" || !DATE_PATTERN.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** 미국 재무부 자료의 "MM/DD/YYYY"를 "YYYY-MM-DD"로. 형식이 틀리거나 없는 날짜면 null. */
export function usDateToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return isValidDateString(iso) ? iso : null;
}
