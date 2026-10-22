// Design Ref: §1.2 보고서 화면 — 국고채 금리 추이 선 그래프(약 7주). 새 패키지 없이 서버에서 SVG로 그린다.
// 값이 없는 날은 선을 끊고, 점선은 전월말 값이다. 점에 마우스를 올리면 날짜와 값이 보인다.
import { INSTRUMENT_LABELS } from "@/lib/db/types";
import { niceRange, spreadLabels, TREND_INSTRUMENTS, type TrendInstrument, type TrendPoint } from "@/lib/reports/trend";

const COLORS: Record<TrendInstrument, string> = { kr3: "#2a78d6", kr10: "#eb6834", kr30: "#1baf7a" };

const W = 800;
const H = 300;
const PAD = { left: 48, right: 76, top: 16, bottom: 30 };

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

type Props = {
  points: TrendPoint[];
  /** 전월말 값(없으면 null)과 그 날짜 */
  baseline: Record<TrendInstrument, number | null>;
  baselineDate: string | null;
};

export function TrendChart({ points, baseline, baselineDate }: Props) {
  const values: number[] = [];
  for (const p of points) for (const k of TREND_INSTRUMENTS) if (p[k] !== null) values.push(p[k] as number);
  for (const k of TREND_INSTRUMENTS) if (baseline[k] !== null) values.push(baseline[k] as number);
  const range = niceRange(values);
  if (points.length < 2 || range === null) {
    return <p className="text-sm text-muted">그래프를 그릴 만큼 값이 모이지 않았어요.</p>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (innerW * i) / (points.length - 1);
  const y = (v: number) => PAD.top + innerH * (1 - (v - range.min) / (range.max - range.min));

  const yTicks: number[] = [];
  for (let v = range.min; v <= range.max + 1e-9; v += range.step) yTicks.push(Math.round(v * 10) / 10);
  const xTickCount = Math.min(6, points.length);
  const xTicks = Array.from(new Set(Array.from({ length: xTickCount }, (_, k) => Math.round(((points.length - 1) * k) / (xTickCount - 1)))));

  const last = points[points.length - 1];
  const endLabels = TREND_INSTRUMENTS.filter((k) => last[k] !== null);
  const labelYs = spreadLabels(endLabels.map((k) => y(last[k] as number)), 14);

  const summary = endLabels
    .map((k) => `${INSTRUMENT_LABELS[k]} ${(last[k] as number).toFixed(3)}`)
    .join(", ");

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {TREND_INSTRUMENTS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k] }} />
            {INSTRUMENT_LABELS[k]}
            {last[k] !== null ? <strong className="tabular-nums">{(last[k] as number).toFixed(3)}</strong> : <span className="text-muted">미수집</span>}
          </span>
        ))}
        {baselineDate ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke="#898781" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            전월말 {shortDate(baselineDate)}
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`국고채 금리 추이 ${shortDate(points[0].date)}부터 ${shortDate(last.date)}까지. ${summary}`}
        className="h-auto w-full"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e1e0d9" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#898781">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#c3c2b7" strokeWidth="1" />
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="12" fill="#898781">
            {shortDate(points[i].date)}
          </text>
        ))}

        {TREND_INSTRUMENTS.map((k) =>
          baseline[k] !== null ? (
            <line
              key={`b-${k}`}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(baseline[k] as number)}
              y2={y(baseline[k] as number)}
              stroke={COLORS[k]}
              strokeOpacity="0.55"
              strokeWidth="1.2"
              strokeDasharray="5 4"
            />
          ) : null,
        )}

        {TREND_INSTRUMENTS.map((k) => {
          // 값이 없는 날을 만나면 선을 끊는다.
          let d = "";
          let pen = false;
          points.forEach((p, i) => {
            const v = p[k];
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
            pen = true;
          });
          return <path key={k} d={d} fill="none" stroke={COLORS[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}

        {endLabels.map((k, idx) => (
          <g key={`e-${k}`}>
            <circle cx={x(points.length - 1)} cy={y(last[k] as number)} r="4.5" fill={COLORS[k]} stroke="#ffffff" strokeWidth="2" />
            <text x={x(points.length - 1) + 10} y={labelYs[idx] + 4} fontSize="12" fontWeight="700" fill="#1E2124">
              {(last[k] as number).toFixed(3)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          TREND_INSTRUMENTS.map((k) =>
            p[k] !== null ? (
              <circle key={`h-${i}-${k}`} cx={x(i)} cy={y(p[k] as number)} r="6" fill="transparent">
                <title>{`${shortDate(p.date)} ${INSTRUMENT_LABELS[k]} ${(p[k] as number).toFixed(3)}%`}</title>
              </circle>
            ) : null,
          ),
        )}
      </svg>
      <figcaption className="text-xs text-muted">
        출처: 금융투자협회 최종호가수익률 · 값이 없는 날은 선을 이어 그리지 않고, 보류(확인 중) 값은 그리지 않아요.
      </figcaption>
    </figure>
  );
}
