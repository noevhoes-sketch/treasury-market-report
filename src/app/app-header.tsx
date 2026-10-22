// Design Ref: §1.2 맨 위 띠 — 앱 이름, 이동 링크, 로그인한 사람(역할), 로그아웃
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/db/types";

export function AppHeader({ email, role }: { email: string; role: Role }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="font-semibold">
          국채시장 동향
        </Link>
        <Link href="/reports" className="text-zinc-600 hover:underline dark:text-zinc-300">
          지난 보고서
        </Link>
        {role === "manager" ? (
          <Link href="/review" className="text-zinc-600 hover:underline dark:text-zinc-300">
            담당자 확인
          </Link>
        ) : null}
      </nav>
      <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
        <span data-testid="who">
          {email} ({ROLE_LABELS[role]})
        </span>
        <button
          type="submit"
          className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700"
        >
          로그아웃
        </button>
      </form>
    </header>
  );
}
