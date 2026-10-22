import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/app/page-skeleton";
import { AppHeader } from "@/app/app-header";
import { reportTitle } from "@/lib/calc/business-days";
import { requireManager } from "@/lib/auth/guard";
import { formatRate } from "@/lib/calc/rates-format";
import { listPendingRequests } from "@/lib/db/access-requests";
import { listApprovedUsers } from "@/lib/db/auth-users";
import { INSTRUMENT_LABELS } from "@/lib/db/types";
import { listHeldRates, listReportDates } from "@/lib/reports/queries";
import { approveLogin, rejectLogin, releaseHold } from "./actions";
import { PasswordForm } from "./password-form";

export const metadata = { title: "담당자 확인 · 국채시장 동향" };

const buttonClass = "btn";

// Design Ref: §1.3 담당자 확인 화면 — 로그인 신청 승인, 전일 대비 변동이 큰 값 확인 (담당자만)
async function Review() {
  await connection();
  const user = await requireManager();
  const [requests, held, reports, approvedUsers] = await Promise.all([
    listPendingRequests(),
    listHeldRates(),
    listReportDates(10),
    listApprovedUsers(),
  ]);

  return (
    <>
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8">
        <section>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">담당자 확인</h1>
          <h2 className="mb-2 text-xl font-bold">가입 신청</h2>
          <p className="mb-3 text-sm text-muted">
            승인하면 신청자가 정한 비밀번호로 로그인할 수 있어요. 아는 사람의 이메일인지 확인한 뒤에 승인해 주세요.
          </p>
          {requests.length === 0 ? (
            <p className="panel text-sm">
              기다리는 신청이 없습니다.
            </p>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {requests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
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
          <h2 className="mb-2 text-xl font-bold">비밀번호 설정</h2>
          <p className="mb-3 text-sm text-muted">
            비밀번호를 잊은 사용자에게 새 비밀번호를 정해 줄 수 있어요. 메일이 가지 않으니 정한 뒤 사용자에게 직접 알려 주세요.
          </p>
          <ul className="card divide-y divide-line overflow-hidden">
            {approvedUsers.map((item) => (
              <li key={item.id}>
                <PasswordForm id={item.id} email={item.email} role={item.role === "manager" ? "담당자" : "열람자"} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-bold">등락 원인 확인·확정</h2>
          <p className="mb-3 text-sm text-muted">
            날짜를 눌러 원인 초안을 확인하고, 필요하면 고쳐서 확정해 주세요. 확정해야 열람자에게 원인이 보여요.
          </p>
          <ul className="card divide-y divide-line overflow-hidden">
            {reports.map((item) => (
              <li key={item.date}>
                <Link
                  href={`/review/${item.date}`}
                  className="flex items-center justify-between px-5 py-4 text-sm hover:bg-surface"
                >
                  <span>{reportTitle(item.date)}</span>
                  <span className={item.confirmed ? "pill pill-ok" : "pill pill-warn"}>{item.confirmed ? "확정 완료" : "확인 필요"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-bold">변동이 큰 값</h2>
          <p className="mb-3 text-sm text-muted">
            전일 대비 변동이 큰 값은 보고서에 &quot;확인 중&quot;으로 가려져 있어요. 값이 맞으면 [그대로 올리기]를 눌러 주세요.
            누가 언제 풀었는지 기록돼요.
          </p>
          {held.length === 0 ? (
            <p className="panel text-sm">
              확인할 값이 없습니다.
            </p>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {held.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
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
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Review />
    </Suspense>
  );
}
