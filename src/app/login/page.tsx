import { Suspense } from "react";
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
    <p role="alert" className="text-sm text-red-600">
      로그인에 실패했습니다. 링크를 다시 받아 주세요.
    </p>
  );
}

// Design Ref: §1.1 로그인 화면 — 이메일 칸과 버튼, 안내 문구
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg bg-white p-8 shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-bold tracking-tight">국채시장 동향</h1>
        <LoginForm />
        <Suspense fallback={null}>
          <ErrorNotice searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
