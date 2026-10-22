// Design Ref: §1.2 보고서 화면 — 제목, 날짜 이동, 상태, 금리 표, 출처·기준일, 등락 원인
import Link from "next/link";
import {
  CAUSE_STATUS_LABELS,
  INSTRUMENT_LABELS,
  MANUAL_SOURCE,
  type ReportRow,
  type Role,
} from "@/lib/db/types";
import { HELD_TEXT, MISSING_TEXT, displayChange, type Cell, type TableRow } from "@/lib/calc/rates-format";
import { todayInKorea } from "@/lib/calc/business-days";
import { reportTitle } from "@/lib/calc/business-days";
import { isTrustedArticleUrl } from "@/lib/cause/infomax";
import type { TrendInstrument, TrendPoint } from "@/lib/reports/trend";
import { TrendChart } from "./trend-chart";

type Props = {
  date: string;
  rows: TableRow[];
  report: ReportRow | null;
  role: Role;
  /** 휴장일(주말 포함)이라 보고서가 없는 날인가 */
  holiday: boolean;
  previousDate: string;
  nextDate: string;
  /** 보류된 값이 있는가 */
  hasHeld: boolean;
  /** 국고채 금리 추이 그래프용 점들 */
  trend: TrendPoint[];
};

/** 금일 동향에서 값이 아직 올라오지 않은 칸의 표시(어제 이전 날짜의 빈 칸은 "미수집") */
const WAITING_TEXT = "대기 중";

function cellClass(cell: Cell): string {
  if (cell.text === WAITING_TEXT) return "text-muted";
  if (cell.text === HELD_TEXT) return "bg-[#fff4e5] font-semibold text-[#8a4b00]";
  if (cell.text === MISSING_TEXT) return "text-muted";
  return "";
}

/** 금일·전일비 칸은 눈에 잘 띄게 연한 파랑 바탕에 굵고 크게 보인다. 보류·미수집 칸은 자기 색을 그대로 둔다. */
function DataCell({ cell, strong = false }: { cell: Cell; strong?: boolean }) {
  const title = cell.source && cell.asOf ? `출처: ${cell.source} · 기준일: ${cell.asOf}` : undefined;
  const emphasis = strong && cellClass(cell) === "" ? "bg-panel text-base font-bold text-brand" : "";
  return (
    <td title={title} className={`whitespace-nowrap px-4 py-3 text-center tabular-nums ${cellClass(cell)} ${emphasis}`}>
      {cell.text}
      {cell.source === MANUAL_SOURCE && cell.text !== MISSING_TEXT ? (
        <span className="ml-1 rounded bg-surface px-1 align-middle text-[10px] font-normal text-muted">직접</span>
      ) : null}
    </td>
  );
}

function shortDate(date: string | null | undefined): string {
  if (!date) return "-";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 한 묶음(국고채 또는 미국)의 열별 기준일 안내 문구. */
function basisText(label: string, row: TableRow | undefined): string {
  if (!row) return `${label}: 자료 없음`;
  return (
    `${label} — 금일 ${shortDate(row.today.asOf)}, 전일 ${shortDate(row.previousDay.asOf)}, ` +
    `전월말 ${shortDate(row.previousMonthEnd.asOf)}, 전년말 ${shortDate(row.previousYearEnd.asOf)}`
  );
}

function sourcesOf(rows: TableRow[]): string {
  const names = new Set<string>();
  for (const row of rows) {
    for (const cell of [row.today, row.previousDay, row.previousMonthEnd, row.previousYearEnd]) {
      if (cell.source) names.add(cell.source);
    }
  }
  return [...names].join(" · ") || "-";
}

function causeText(report: ReportRow | null, line: "kr" | "us", role: Role): string {
  const status = report?.[line === "kr" ? "cause_status_kr" : "cause_status_us"] ?? "waiting_article";
  const text = report?.[line === "kr" ? "cause_kr" : "cause_us"] ?? null;
  const confirmed = report?.confirmed_at != null;
  // 열람자에게는 확정된 원인만 보인다. 확정 전에는 "작성 중"만 보인다.
  if (role !== "manager" && !confirmed) return "작성 중";
  if (text) return text;
  return CAUSE_STATUS_LABELS[status];
}

/** 원인 줄 옆에 붙는 안내: 담당자에게는 "초안, 담당자 확인 필요", 보이는 사람에게는 근거 기사 링크 */
function CauseExtras({ report, line, role }: { report: ReportRow | null; line: "kr" | "us"; role: Role }) {
  const status = report?.[line === "kr" ? "cause_status_kr" : "cause_status_us"];
  const url = report?.[line === "kr" ? "source_url_kr" : "source_url_us"];
  const confirmed = report?.confirmed_at != null;
  const visible = role === "manager" || confirmed;
  return (
    <>
      {role === "manager" && !confirmed && status === "draft" ? (
        <span className="pill pill-warn ml-2">초안, 담당자 확인 필요</span>
      ) : null}
      {visible && isTrustedArticleUrl(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="link ml-2 text-xs">
          근거 기사
        </a>
      ) : null}
    </>
  );
}

export function ReportView(props: Props) {
  const { date, rows, report, role, holiday, previousDate, nextDate, hasHeld, trend } = props;
  // 그래프의 점선(전월말 값): 표의 전월말 칸이 숫자일 때만 쓴다.
  const monthEnd = (instrument: TrendInstrument): number | null => {
    const text = rows.find((row) => row.instrument === instrument)?.previousMonthEnd.text ?? "";
    return /^\d/.test(text) ? Number(text) : null;
  };
  const baseline = { kr3: monthEnd("kr3"), kr10: monthEnd("kr10"), kr30: monthEnd("kr30") };
  const baselineDate = rows.find((row) => row.instrument === "kr3")?.previousMonthEnd.asOf ?? null;
  const kr = rows.find((row) => row.instrument === "kr3");
  const us = rows.find((row) => row.instrument === "us10");
  const krDone = rows.filter((row) => row.instrument.startsWith("kr")).every((row) => row.today.text !== MISSING_TEXT);
  const confirmed = report?.confirmed_at != null;
  // 오늘(또는 앞으로의) 국고채 값이 아직 안 올라왔으면 "미수집" 대신 "대기 중"으로 보여준다. 이미 지난 날짜의 빈 칸은 그대로 "미수집".
  const waitingToday = !krDone && date >= todayInKorea();
  // 변동폭 칸은 하락을 마이너스 대신 △로 보여 준다.
  const shown = (cell: Cell): Cell => ({ ...cell, text: displayChange(cell.text) });
  const waiting = (cell: Cell): Cell => (waitingToday && cell.text === MISSING_TEXT ? { ...cell, text: WAITING_TEXT } : cell);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{reportTitle(date)}</h1>
        <div className="flex items-center gap-2">
          <Link href={`/reports/${previousDate}`} className="btn">
            ◀ 전일
          </Link>
          <Link href="/reports" className="btn">
            날짜 선택
          </Link>
          <Link href={`/reports/${nextDate}`} className="btn">
            다음 ▶
          </Link>
        </div>
      </div>

      {holiday ? (
        <p className="panel text-base font-semibold">휴장일이라 보고서가 없습니다.</p>
      ) : (
        <>
          <p data-testid="status" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">상태:</span>
            {krDone ? (
              <>
                <span className="pill pill-ok">금리 표 완료</span>
                <span>·</span>
                <span className={confirmed ? "pill pill-ok" : "pill pill-wait"}>
                  {confirmed ? "원인 확정 완료" : "원인 확정 대기"}
                </span>
              </>
            ) : (
              <span className="pill pill-wait">대기 중 — 금투협 오후 값이 올라오면 채워져요</span>
            )}
          </p>

          {hasHeld ? (
            <p role="status" className="rounded-2xl bg-[#fff4e5] px-5 py-4 text-sm text-[#8a4b00]">
              전일 대비 변동이 큰 값이 있어 &quot;{HELD_TEXT}&quot;으로 가려 두었어요.
              {role === "manager" ? (
                <>
                  {" "}
                  <Link href="/review" className="link">
                    담당자 확인 화면
                  </Link>
                  에서 확인해 주세요.
                </>
              ) : null}
            </p>
          ) : null}

          <section className="panel flex flex-col gap-3">
            <h2 className="text-xl font-bold">금리 표</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-bold">구분</th>
                    {["전년말", "전월말", "전일", "금일", "전일비", "전월말비", "전년말비"].map((name) => (
                      <th
                        key={name}
                        className={`whitespace-nowrap px-4 py-3 text-center font-bold ${name === "금일" || name === "전일비" ? "bg-brand text-white" : ""}`}
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.instrument} className="border-t border-line">
                      <th className="whitespace-nowrap px-4 py-3 text-left font-bold">{INSTRUMENT_LABELS[row.instrument]}</th>
                      <DataCell cell={row.previousYearEnd} />
                      <DataCell cell={row.previousMonthEnd} />
                      <DataCell cell={row.previousDay} />
                      <DataCell cell={row.instrument.startsWith("kr") ? waiting(row.today) : row.today} strong />
                      <DataCell cell={shown(row.instrument.startsWith("kr") ? waiting(row.changeFromPreviousDay) : row.changeFromPreviousDay)} strong />
                      <DataCell cell={shown(row.instrument.startsWith("kr") ? waiting(row.changeFromMonthEnd) : row.changeFromMonthEnd)} />
                      <DataCell cell={shown(row.instrument.startsWith("kr") ? waiting(row.changeFromYearEnd) : row.changeFromYearEnd)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-1 text-xs text-muted">
              <p>출처: {sourcesOf(rows)} (칸에 마우스를 올리면 출처와 기준일이 보여요)</p>
              <p>기준일 · {basisText("국고채", kr)}</p>
              <p>기준일 · {basisText("미국 10년(최신 마감일 값)", us)}</p>
            </div>
          </section>

          <section className="panel flex flex-col gap-3">
            <h2 className="text-xl font-bold">국고채 금리 추이</h2>
            <div className="card p-4">
              <TrendChart points={trend} baseline={baseline} baselineDate={baselineDate} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">등락 원인</h2>
              {role === "manager" ? (
                <Link href={`/review/${date}`} className="link text-sm">
                  원인 확인·확정 →
                </Link>
              ) : null}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="card p-5">
                <dt className="mb-1 text-sm font-bold text-brand">국고채</dt>
                <dd>
                  {causeText(report, "kr", role)}
                  <CauseExtras report={report} line="kr" role={role} />
                </dd>
              </div>
              <div className="card p-5">
                <dt className="mb-1 text-sm font-bold text-brand">미국 금리</dt>
                <dd>
                  {causeText(report, "us", role)}
                  <CauseExtras report={report} line="us" role={role} />
                </dd>
              </div>
            </dl>
            {role !== "manager" ? null : confirmed ? (
              <p>
                <a href={`/api/reports/${date}/hwpx`} className="btn btn-primary" download>
                  한글 파일(.hwpx) 내려받기
                </a>
              </p>
            ) : (
              <p className="text-sm text-muted">담당자가 원인을 확정하면 한글 파일을 내려받을 수 있어요.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
