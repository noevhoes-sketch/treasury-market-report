import { Suspense } from "react";
import { connection } from "next/server";
import { AppHeader } from "@/app/app-header";
import { reportTitle } from "@/lib/calc/business-days";
import { requireManager } from "@/lib/auth/guard";
import { formatRate } from "@/lib/calc/rates-format";
import { INSTRUMENT_LABELS } from "@/lib/db/types";
import { listHeldRates } from "@/lib/reports/queries";
import { releaseHold } from "./actions";

export const metadata = { title: "담당자 확인 · 국채시장 동향" };

// Design Ref: §1.3 담당자 확인 화면 — 전일 대비 변동이 큰 값을 확인하고 그대로 올린다 (담당자만)
async function Review() {
  await connection();
  const user = await requireManager();
  const held = await listHeldRates();

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">담당자 확인</h1>
        <p className="mb-4 text-sm text-zinc-500">
          전일 대비 변동이 큰 값은 보고서에 &quot;확인 중&quot;으로 가려져 있어요. 값이 맞으면 [그대로 올리기]를 눌러 주세요.
          누가 언제 풀었는지 기록돼요.
        </p>
        {held.length === 0 ? (
          <p className="rounded-md bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
            확인할 값이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {held.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  {reportTitle(item.rate_date)} · {INSTRUMENT_LABELS[item.instrument]} ·{" "}
                  <strong className="tabular-nums">{formatRate(item.rate)}</strong> ({item.source})
                </span>
                <form action={releaseHold}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">
                    그대로 올리기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <Review />
    </Suspense>
  );
}
