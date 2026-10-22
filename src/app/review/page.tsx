import { Suspense } from "react";
import { connection } from "next/server";
import { AppHeader } from "@/app/app-header";
import { reportTitle } from "@/lib/calc/business-days";
import { requireManager } from "@/lib/auth/guard";
import { formatRate } from "@/lib/calc/rates-format";
import { listPendingRequests } from "@/lib/db/access-requests";
import { INSTRUMENT_LABELS } from "@/lib/db/types";
import { listHeldRates } from "@/lib/reports/queries";
import { approveLogin, rejectLogin, releaseHold } from "./actions";

export const metadata = { title: "담당자 확인 · 국채시장 동향" };

const buttonClass = "rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700";

// Design Ref: §1.3 담당자 확인 화면 — 로그인 신청 승인, 전일 대비 변동이 큰 값 확인 (담당자만)
async function Review() {
  await connection();
  const user = await requireManager();
  const [requests, held] = await Promise.all([listPendingRequests(), listHeldRates()]);

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
        <section>
          <h1 className="mb-2 text-2xl font-bold tracking-tight">담당자 확인</h1>
          <h2 className="mb-2 text-lg font-semibold">로그인 신청</h2>
          <p className="mb-3 text-sm text-zinc-500">
            승인하면 그 이메일만 입력해도 로그인돼요. 아는 사람의 이메일인지 확인한 뒤에 승인해 주세요.
          </p>
          {requests.length === 0 ? (
            <p className="rounded-md bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
              기다리는 신청이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {requests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <strong>{request.email}</strong>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <form action={approveLogin}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="role" value="viewer" />
                      <button type="submit" className={buttonClass}>열람자로 승인</button>
                    </form>
                    <form action={approveLogin}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="role" value="manager" />
                      <button type="submit" className={buttonClass}>담당자로 승인</button>
                    </form>
                    <form action={rejectLogin}>
                      <input type="hidden" name="id" value={request.id} />
                      <button type="submit" className={buttonClass}>거절</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">변동이 큰 값</h2>
          <p className="mb-3 text-sm text-zinc-500">
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
                    <button type="submit" className={buttonClass}>그대로 올리기</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
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
