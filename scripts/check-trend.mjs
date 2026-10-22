// 금리 추이 그래프 데이터 확인: 보류 값 제외, 값 없는 날은 null(선 끊김), 보고서 날짜 이후 제외, 세로축 범위.
// 실행: node --experimental-strip-types scripts/check-trend.mjs
import { buildTrend, niceRange, spreadLabels } from "../src/lib/reports/trend.ts";

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failed++; };
const r = (d, i, v, held = false) => ({ rate_date: d, instrument: i, rate: v, held });

const t = buildTrend([
  r("2026-10-20", "kr3", "3.840"), r("2026-10-20", "kr10", 4.176), r("2026-10-20", "kr30", 4.264),
  r("2026-10-21", "kr3", 3.822), r("2026-10-21", "kr10", 4.16, true), r("2026-10-21", "kr30", 4.251),
  r("2026-10-22", "kr3", 3.8), r("2026-10-19", "us10", 4.0), r("2026-10-19", "kr3", 3.877),
], "2026-10-21");
ok("날짜순 3개 점(보고서 날짜 이후와 미국 값은 제외)", t.length === 3 && t[0].date === "2026-10-19" && t[2].date === "2026-10-21");
ok("문자열 금리도 숫자로", t[1].kr3 === 3.84);
ok("보류 값은 null(그리지 않음)", t[2].kr10 === null && t[2].kr30 === 4.251);
ok("값이 없는 칸은 null(선이 끊김)", t[0].kr10 === null && t[0].kr30 === null);
ok("빈 입력은 빈 목록", buildTrend([], "2026-10-21").length === 0);

let n = niceRange([3.822, 4.16, 4.251, 4.011]);
ok("범위가 값을 모두 포함", n.min <= 3.822 && n.max >= 4.251);
ok("범위가 0.1 단위", Math.abs(n.min * 10 - Math.round(n.min * 10)) < 1e-9 && Math.abs(n.max * 10 - Math.round(n.max * 10)) < 1e-9);
n = niceRange([4.0, 4.0]);
ok("값이 한 점뿐이어도 범위가 생긴다", n.max - n.min >= 0.2 - 1e-9);
n = niceRange([3.0, 5.5]);
ok("범위가 넓으면 눈금 간격이 넓어진다(6칸 이하)", (n.max - n.min) / n.step <= 6);
ok("값이 없으면 null", niceRange([]) === null);
const ys = spreadLabels([100, 104, 150], 14);
ok("끝 라벨이 겹치지 않는다", ys[1] - ys[0] >= 14 && ys[2] >= ys[1]);
process.exit(failed ? 1 : 0);
