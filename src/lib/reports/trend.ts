// Design Ref: §1.2 보고서 화면 — 국고채 금리 추이 그래프에 쓰는 데이터 만들기
// 값이 없는 날은 null로 두어 그래프에서 선이 끊기게 하고, 추정해서 채우지 않는다(PRD 5번). 보류("확인 중") 값은 그리지 않는다.

export const TREND_INSTRUMENTS = ["kr3", "kr10", "kr30"] as const;
export type TrendInstrument = (typeof TREND_INSTRUMENTS)[number];

/** 그래프에 보여줄 기간(달력 일수). 약 7주. */
export const TREND_DAYS = 50;

export type TrendRecord = { rate_date: string; instrument: string; rate: number | string; held: boolean };
export type TrendPoint = { date: string } & Record<TrendInstrument, number | null>;

/** 보고서 날짜까지의 국고채 값 모음을 날짜순 점 목록으로. 국고채 값이 하나도 없는 날은 점을 만들지 않는다(휴장일 등). */
export function buildTrend(records: readonly TrendRecord[], date: string): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const record of records) {
    if (record.rate_date > date || record.held) continue;
    if (!(TREND_INSTRUMENTS as readonly string[]).includes(record.instrument)) continue;
    const point = byDate.get(record.rate_date) ?? { date: record.rate_date, kr3: null, kr10: null, kr30: null };
    point[record.instrument as TrendInstrument] = Number(record.rate);
    byDate.set(record.rate_date, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 세로축 범위: 값들을 포함하도록 눈금 간격(0.1·0.2·0.5·1) 단위로 맞추고, 눈금 칸이 6개 이하가 되는 가장 작은 간격을 고른다. */
export function niceRange(values: readonly number[]): { min: number; max: number; step: number } | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  let best: { min: number; max: number; step: number } | null = null;
  for (const step of [0.1, 0.2, 0.5, 1, 2]) {
    let min = Math.floor(lo / step + 1e-9) * step;
    let max = Math.ceil(hi / step - 1e-9) * step;
    if (max - min < 0.2 - 1e-9) {
      // 값이 거의 한 점이면 위아래로 한 칸씩 넓힌다.
      min -= step;
      max += step;
    }
    best = { min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, step };
    if ((best.max - best.min) / step <= 6 + 1e-9) break;
  }
  return best;
}

/** 겹치지 않게 끝 라벨의 세로 위치를 벌린다. 위에서 아래로 최소 gap만큼 간격을 둔다. */
export function spreadLabels(ys: readonly number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k += 1) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap;
  }
  const out = new Array<number>(ys.length);
  for (const { y, i } of order) out[i] = y;
  return out;
}
