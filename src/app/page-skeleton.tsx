// 화면 데이터를 불러오는 동안 보여주는 자리 표시(스켈레톤).
// 로그인한 사람의 이메일·역할은 데이터를 읽은 뒤에야 알 수 있어서 맨 위 띠에는 로고만 먼저 보이고, 나머지는 회색 뼈대가 깜빡인다.
// 빈 화면 대신 "불러오는 중"임을 알려 주고, 실제 화면과 비슷한 모양이라 내용이 들어올 때 화면이 덜 흔들린다.
import { SiteLogo } from "./site-logo";

const bar = "animate-pulse rounded-xl bg-surface";

export function PageSkeleton({ variant = "report" }: { variant?: "report" | "list" }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-2">
          <SiteLogo />
        </div>
      </header>
      <main aria-busy="true" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        <p role="status" className="sr-only">
          불러오는 중입니다.
        </p>
        <div className={`${bar} h-9 w-64`} />
        {variant === "report" ? (
          <>
            <div className={`${bar} h-6 w-48`} />
            <div className="panel flex flex-col gap-3">
              <div className={`${bar} h-6 w-24 bg-white`} />
              <div className={`${bar} h-56 bg-white`} />
            </div>
            <div className="panel flex flex-col gap-3">
              <div className={`${bar} h-6 w-40 bg-white`} />
              <div className={`${bar} h-64 bg-white`} />
            </div>
          </>
        ) : (
          <div className="card flex flex-col gap-3 p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={`${bar} h-10`} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
