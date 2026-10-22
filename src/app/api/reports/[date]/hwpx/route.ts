// Design Ref: §2.4 한글 파일 — 확정된 보고서만 .hwpx로 내려받는다 (Plan 작업 15)
// 담당자만 받을 수 있다. 확정 전 보고서는 원인이 초안이라 내려주지 않는다.
import { getAccess } from "@/lib/auth/session";
import { buildReportTable, type TableRow } from "@/lib/calc/rates-format";
import { pickReportInputs } from "@/lib/calc/report-table";
import { buildHwpx } from "@/lib/hwpx/build";
import { isValidDateString } from "@/lib/rates/validate";
import { fetchKrHolidaySet, fetchRatesForReport, fetchReportRow, isKrHoliday } from "@/lib/reports/queries";

function shortDate(date: string | null | undefined): string {
  if (!date) return "-";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function basis(label: string, row: TableRow | undefined): string {
  if (!row) return `기준일 · ${label}: 자료 없음`;
  return (
    `기준일 · ${label} — 금일 ${shortDate(row.today.asOf)}, 전일 ${shortDate(row.previousDay.asOf)}, ` +
    `전월말 ${shortDate(row.previousMonthEnd.asOf)}, 전년말 ${shortDate(row.previousYearEnd.asOf)}`
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const access = await getAccess();
  if (!access.ok) return new Response("로그인이 필요합니다.", { status: 401 });
  // 한글 파일은 담당자만 내려받는다(설계 §2.4). 열람자는 화면으로 확정된 보고서를 본다.
  if (access.user.role !== "manager") return new Response("담당자만 내려받을 수 있습니다.", { status: 403 });

  const { date } = await params;
  if (!isValidDateString(date)) return new Response("날짜가 올바르지 않습니다.", { status: 404 });
  if (await isKrHoliday(date)) return new Response("휴장일에는 보고서가 없습니다.", { status: 404 });

  const [report, records, krHolidays] = await Promise.all([fetchReportRow(date), fetchRatesForReport(date), fetchKrHolidaySet(date)]);
  if (!report || report.confirmed_at == null) {
    return new Response("담당자가 확정한 보고서만 내려받을 수 있습니다.", { status: 409 });
  }

  const rows = buildReportTable(pickReportInputs(records, date, krHolidays));
  const names = new Set<string>();
  for (const row of rows) {
    for (const cell of [row.today, row.previousDay, row.previousMonthEnd, row.previousYearEnd]) {
      if (cell.source) names.add(cell.source);
    }
  }

  const bytes = buildHwpx({
    date,
    rows,
    causeKr: report.cause_kr ?? "원인 없음",
    causeUs: report.cause_us ?? "원인 없음",
    sources: [...names].join(" · ") || "-",
    basisLines: [
      basis("국고채", rows.find((row) => row.instrument === "kr3")),
      basis("미국 10년(최신 마감일 값)", rows.find((row) => row.instrument === "us10")),
    ],
  });

  const filename = `국채시장동향_${date}.hwpx`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/hwp+zip",
      "content-disposition": `attachment; filename="treasury-${date}.hwpx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
