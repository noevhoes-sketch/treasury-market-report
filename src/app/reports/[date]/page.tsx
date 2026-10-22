import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppHeader } from "@/app/app-header";
import {
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  toHolidaySet,
} from "@/lib/calc/business-days";
import { pickReportInputs } from "@/lib/calc/report-table";
import { buildReportTable } from "@/lib/calc/rates-format";
import { requireUser } from "@/lib/auth/guard";
import { isValidDateString } from "@/lib/rates/validate";
import {
  fetchKrHolidaysAround,
  fetchRatesForReport,
  fetchReportRow,
} from "@/lib/reports/queries";
import { ReportView } from "../report-view";

// Design Ref: §1.2 보고서 화면 `/reports/2026-10-22` (날짜별)
async function Report({ params }: { params: Promise<{ date: string }> }) {
  await connection();
  const user = await requireUser();

  // 주소의 날짜는 데이터베이스를 읽기 전에 검사한다(DESIGN §4.5). 입력값은 화면에 그대로 보여주지 않는다.
  const { date } = await params;
  if (!isValidDateString(date)) notFound();

  const [records, report, holidayRows] = await Promise.all([
    fetchRatesForReport(date),
    fetchReportRow(date),
    fetchKrHolidaysAround(date),
  ]);
  const holidays = toHolidaySet(holidayRows, "kr");
  const rows = buildReportTable(pickReportInputs(records, date));
  const hasHeld = records.some(
    (record) => record.held && (record.rate_date === date || record.instrument === "us10"),
  );

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="flex-1">
        <ReportView
          date={date}
          rows={rows}
          report={report}
          role={user.role}
          holiday={!isBusinessDay(date, holidays)}
          previousDate={previousBusinessDay(date, holidays)}
          nextDate={nextBusinessDay(date, holidays)}
          hasHeld={hasHeld}
        />
      </main>
    </>
  );
}

export default function ReportPage({ params }: { params: Promise<{ date: string }> }) {
  return (
    <Suspense fallback={null}>
      <Report params={params} />
    </Suspense>
  );
}
