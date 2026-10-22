import { Suspense } from "react";
import { SiteLogo } from "@/app/site-logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 · 국채시장 동향" };

// 주소의 ?error=1을 읽는 부분. 요청마다 달라지는 값이라 Suspense 안에서 읽는다.
async function ErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-red-700">
      로그인에 실패했습니다. 다시 시도해 주세요.
    </p>
  );
}

// Design Ref: §1.1 로그인 화면 — 맨 위 왼쪽 로고, 가운데 로그인 카드
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-2">
          <SiteLogo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center bg-surface px-4 py-12">
        <div className="card flex w-full max-w-md flex-col gap-6 p-8 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">로그인</h1>
            <p className="mt-1 text-sm text-muted">국채시장 동향 보고서를 보려면 로그인해 주세요.</p>
          </div>
          <LoginForm />
          <Suspense fallback={null}>
            <ErrorNotice searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
