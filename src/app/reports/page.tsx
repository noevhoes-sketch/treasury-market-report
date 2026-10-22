import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">지난 보고서</h1>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">아직 보고서가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((item) => (
              <li key={item.date}>
                <Link
                  href={`/reports/${item.date}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span>{reportTitle(item.date)}</span>
                  <span className="text-zinc-500">
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
    <Suspense fallback={null}>
      <List />
    </Suspense>
  );
}
