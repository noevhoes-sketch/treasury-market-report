import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/db/types";
import { getAccess } from "@/lib/auth/session";

// 로그인한 사람에게만 보이는 첫 화면. 보고서 화면은 이후 작업(8번)에서 채운다.
async function Shell() {
  // 요청이 올 때마다 새로 그리는 화면이라는 것을 먼저 알린다(로그인 정보는 요청마다 다르다).
  await connection();
  const access = await getAccess();
  if (!access.ok) redirect("/login");

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="font-semibold">국채시장 동향</span>
        <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
          <span data-testid="who">
            {access.user.email} ({ROLE_LABELS[access.user.role]})
          </span>
          <button type="submit" className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">
            로그아웃
          </button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">국채시장 동향</h1>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  );
}
