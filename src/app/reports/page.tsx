import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/app/page-skeleton";
import { AppHeader } from "@/app/app-header";
import { reportTitle } from "@/lib/calc/business-days";
import { requireUser } from "@/lib/auth/guard";
import { listReportDates } from "@/lib/reports/queries";

export const metadata = { title: "지난 보고서 · 국채시장 동향" };

// Design Ref: §1.4 지난 보고서 목록 — 날짜 내림차순, 줄마다 제목과 상태
async function List() {
  await connection();
  const user = await requireUser();
  const items = await listReportDates();

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="mb-5 text-3xl font-bold tracking-tight">지난 보고서</h1>
        {items.length === 0 ? (
          <p className="panel text-sm">아직 보고서가 없습니다.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {items.map((item) => (
              <li key={item.date}>
                <Link
                  href={`/reports/${item.date}`}
                  className="flex items-center justify-between px-5 py-4 text-base hover:bg-surface"
                >
                  <span>{reportTitle(item.date)}</span>
                  <span className={item.confirmed ? "pill pill-ok" : item.tableStatus === "waiting" ? "pill pill-wait" : "pill pill-warn"}>
                    {item.confirmed ? "확정 완료" : item.tableStatus === "waiting" ? "대기 중" : "표 완료"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <List />
    </Suspense>
  );
}
