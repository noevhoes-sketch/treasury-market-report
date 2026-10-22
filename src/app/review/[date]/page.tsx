import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageSkeleton } from "@/app/page-skeleton";
import { AppHeader } from "@/app/app-header";
import { isBusinessDay, reportTitle, todayInKorea, toHolidaySet } from "@/lib/calc/business-days";
import { buildReportTable, MISSING_TEXT } from "@/lib/calc/rates-format";
import { pickReportInputs } from "@/lib/calc/report-table";
import { requireManager } from "@/lib/auth/guard";
import { isTrustedArticleUrl } from "@/lib/cause/infomax";
import { CAUSE_STATUS_LABELS, MANUAL_SOURCE } from "@/lib/db/types";
import { isValidDateString } from "@/lib/rates/validate";
import { whyCannotConfirm } from "@/lib/reports/cause-store";
import { fetchKrHolidaySet, fetchKrHolidaysAround, fetchRatesForReport, fetchReportRow } from "@/lib/reports/queries";
import { CauseForm } from "./cause-form";
import { RatesForm } from "./rates-form";

export const metadata = { title: "원인 확인·확정 · 국채시장 동향" };

function kstDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

// Design Ref: §1.3 담당자 확인 화면 `/review/날짜` — 등락 원인 문장 확인·수정·확정 (담당자만)
async function ReviewDate({ params }: { params: Promise<{ date: string }> }) {
  await connection();
  const user = await requireManager();

  // 주소의 날짜는 데이터베이스를 읽기 전에 검사한다(DESIGN §4.5).
  const { date } = await params;
  if (!isValidDateString(date)) notFound();

  const [report, records, holidayRows, krHolidays] = await Promise.all([fetchReportRow(date), fetchRatesForReport(date), fetchKrHolidaysAround(date), fetchKrHolidaySet(date)]);
  // 직접 입력은 영업일(오늘까지)에만 받고, 이미 자동으로 수집된 국고채 칸은 잠근다.
  const canInput = date <= todayInKorea() && isBusinessDay(date, toHolidaySet(holidayRows, "kr"));
  const rows = buildReportTable(pickReportInputs(records, date, krHolidays));
  const confirmed = report?.confirmed_at != null;
  const autoFilled = (index: number) => rows[index].today.text !== MISSING_TEXT && rows[index].today.source !== MANUAL_SOURCE;
  const locked = { kr3: autoFilled(0), kr10: autoFilled(1), kr30: autoFilled(2) };
  const blocker = whyCannotConfirm(report);
  const stale = report?.cause_status_kr === "stale" || report?.cause_status_us === "stale";
  // 금리가 바뀌어 확정이 풀린 적이 있으면(원인 줄이 '근거 기사 없음'이어도) 알려 준다.
  const unconfirmedByChange = !confirmed && report?.unconfirmed_at != null;

  // 확정된 보고서의 줄은 "확정"으로, 아니면 줄별 상태(초안·숫자 바뀜·기사 대기 중 등)를 보여준다.
  const label = (status: keyof typeof CAUSE_STATUS_LABELS | undefined) =>
    confirmed ? "확정" : CAUSE_STATUS_LABELS[status ?? "waiting_article"];

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-8">
        <div>
          <Link href="/review" className="text-sm text-muted hover:underline">
            ← 담당자 확인
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{reportTitle(date)}</h1>
          <p className="text-sm text-muted">
            등락 원인 문장 확인·확정 ·{" "}
            <Link href={`/reports/${date}`} className="link">
              보고서 보기
            </Link>
          </p>
        </div>

        {stale || unconfirmedByChange ? (
          <p role="status" className="rounded-2xl bg-[#fff4e5] px-5 py-4 text-sm text-[#8a4b00]">
            금리 숫자가 바뀌어 확정이 풀렸어요{report?.unconfirmed_at ? ` (${kstDateTime(report.unconfirmed_at)})` : ""}. 표와 문장을 다시 확인하고 저장·확정해 주세요.
          </p>
        ) : null}
        {confirmed ? (
          <p role="status" className="rounded-2xl bg-[#e6f4ea] px-5 py-4 text-sm text-[#1b6b34]">
            확정되었습니다 ({kstDateTime(report!.confirmed_at!)}). 문장을 고쳐 저장하면 확정이 풀려요.
          </p>
        ) : blocker ? (
          <p className="panel text-sm">지금은 확정할 수 없어요: {blocker}</p>
        ) : null}

        <CauseForm
          date={date}
          kr={report?.cause_kr ?? ""}
          us={report?.cause_us ?? ""}
          krLabel={label(report?.cause_status_kr)}
          usLabel={label(report?.cause_status_us)}
          krUrl={isTrustedArticleUrl(report?.source_url_kr) ? report!.source_url_kr : null}
          usUrl={isTrustedArticleUrl(report?.source_url_us) ? report!.source_url_us : null}
        />

        <section className="panel flex flex-col gap-3">
          <h2 className="text-xl font-bold">금리 직접 입력</h2>
          <p className="text-sm text-muted">
            자동 수집이 안 된 날에만 쓰세요. 적은 칸만 저장되고, 출처는 &quot;담당자 직접 입력&quot;으로 남아요. 직접 넣은 값은 자동 수집이 덮어쓰지 않아요. 이미 자동으로 수집된 칸은 바꿀 수 없어요.
          </p>
          {canInput ? (
            <RatesForm date={date} usDefault={rows[3].today.asOf ?? ""} locked={locked} />
          ) : (
            <p className="text-sm font-semibold">주말·휴장일이거나 아직 오지 않은 날짜라서 금리를 직접 넣을 수 없어요.</p>
          )}
        </section>

        <section className="text-sm text-muted">
          <p>
            금리 표 기준: 국고채 3년 {rows[0].today.text}
            {rows[0].changeFromPreviousDay.text !== "미수집" ? `(전일비 ${rows[0].changeFromPreviousDay.text})` : ""}, 미국 10년{" "}
            {rows[3].today.text}
            {rows[3].changeFromPreviousDay.text !== "미수집" ? `(전일비 ${rows[3].changeFromPreviousDay.text})` : ""}.
            문장에는 표에 있는 숫자만 쓸 수 있고, 전망·의견 표현은 쓸 수 없어요.
          </p>
        </section>
      </main>
    </>
  );
}

export default function ReviewDatePage({ params }: { params: Promise<{ date: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <ReviewDate params={params} />
    </Suspense>
  );
}
