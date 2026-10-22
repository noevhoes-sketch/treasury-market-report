// Design Ref: §1.2 보고서 화면 — 제목, 날짜 이동, 상태, 금리 표, 출처·기준일, 등락 원인
import Link from "next/link";
import {
  CAUSE_STATUS_LABELS,
  INSTRUMENT_LABELS,
  type ReportRow,
  type Role,
} from "@/lib/db/types";
import { HELD_TEXT, MISSING_TEXT, type Cell, type TableRow } from "@/lib/calc/rates-format";
import { reportTitle } from "@/lib/calc/business-days";
import { isTrustedArticleUrl } from "@/lib/cause/infomax";

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
};

function cellClass(cell: Cell): string {
  if (cell.text === HELD_TEXT) return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  if (cell.text === MISSING_TEXT) return "text-zinc-400";
  return "";
}

function DataCell({ cell }: { cell: Cell }) {
  const title = cell.source && cell.asOf ? `출처: ${cell.source} · 기준일: ${cell.asOf}` : undefined;
  return (
    <td title={title} className={`px-3 py-2 text-right tabular-nums ${cellClass(cell)}`}>
      {cell.text}
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
        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          초안, 담당자 확인 필요
        </span>
      ) : null}
      {visible && isTrustedArticleUrl(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-700 underline dark:text-blue-300">
          근거 기사
        </a>
      ) : null}
    </>
  );
}

export function ReportView(props: Props) {
  const { date, rows, report, role, holiday, previousDate, nextDate, hasHeld } = props;
  const kr = rows.find((row) => row.instrument === "kr3");
  const us = rows.find((row) => row.instrument === "us10");
  const krDone = rows.filter((row) => row.instrument.startsWith("kr")).every((row) => row.today.text !== MISSING_TEXT);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{reportTitle(date)}</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/reports/${previousDate}`} className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            ◀ 전일
          </Link>
          <Link href="/reports" className="text-zinc-600 hover:underline dark:text-zinc-300">
            날짜 선택
          </Link>
          <Link href={`/reports/${nextDate}`} className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            다음 ▶
          </Link>
        </div>
      </div>

      {holiday ? (
        <p className="rounded-md bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
          휴장일이라 보고서가 없습니다.
        </p>
      ) : (
        <>
          <p data-testid="status" className="text-sm text-zinc-600 dark:text-zinc-300">
            상태:{" "}
            {krDone
              ? report?.confirmed_at
                ? "금리 표 완료 · 원인 확정 완료"
                : "금리 표 완료 · 원인 확정 대기"
              : "대기 중 — 금투협 오후 값이 올라오면 채워져요"}
          </p>

          {hasHeld ? (
            <p role="status" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              전일 대비 변동이 큰 값이 있어 &quot;{HELD_TEXT}&quot;으로 가려 두었어요.
              {role === "manager" ? (
                <>
                  {" "}
                  <Link href="/review" className="underline">
                    담당자 확인 화면
                  </Link>
                  에서 확인해 주세요.
                </>
              ) : null}
            </p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">금리 표</h2>
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">구분</th>
                    {["전년말", "전월말", "전일", "금일", "전년말비", "전월말비", "전일비"].map((name) => (
                      <th key={name} className="px-3 py-2 text-right font-medium">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.instrument} className="border-t border-zinc-200 dark:border-zinc-800">
                      <th className="px-3 py-2 text-left font-medium">{INSTRUMENT_LABELS[row.instrument]}</th>
                      <DataCell cell={row.previousYearEnd} />
                      <DataCell cell={row.previousMonthEnd} />
                      <DataCell cell={row.previousDay} />
                      <DataCell cell={row.today} />
                      <DataCell cell={row.changeFromYearEnd} />
                      <DataCell cell={row.changeFromMonthEnd} />
                      <DataCell cell={row.changeFromPreviousDay} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-1 text-xs text-zinc-500">
              <p>출처: {sourcesOf(rows)} (칸에 마우스를 올리면 출처와 기준일이 보여요)</p>
              <p>기준일 · {basisText("국고채", kr)}</p>
              <p>기준일 · {basisText("미국 10년(최신 마감일 값)", us)}</p>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">등락 원인</h2>
              {role === "manager" ? (
                <Link href={`/review/${date}`} className="text-sm text-blue-700 underline dark:text-blue-300">
                  원인 확인·확정 →
                </Link>
              ) : null}
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="font-medium">국고채</dt>
                <dd className="text-zinc-600 dark:text-zinc-300">
                  {causeText(report, "kr", role)}
                  <CauseExtras report={report} line="kr" role={role} />
                </dd>
              </div>
              <div>
                <dt className="font-medium">미국 금리</dt>
                <dd className="text-zinc-600 dark:text-zinc-300">
                  {causeText(report, "us", role)}
                  <CauseExtras report={report} line="us" role={role} />
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
