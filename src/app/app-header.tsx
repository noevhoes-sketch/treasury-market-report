// Design Ref: §1.2 맨 위 띠 — 로고(좌측 고정, 누르면 홈), 이동 링크, 로그인한 사람(역할), 로그아웃
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/db/types";
import { SiteLogo } from "./site-logo";

const navLink = "rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-surface";

export function AppHeader({ email, role }: { email: string; role: Role }) {
  return (
    // 스크롤해도 맨 위에 붙어 있어서 로고가 항상 왼쪽 위에 보인다.
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <SiteLogo />
          <nav aria-label="주요 메뉴" className="flex items-center gap-1">
            <Link href="/" className={navLink}>
              오늘 보고서
            </Link>
            <Link href="/reports" className={navLink}>
              지난 보고서
            </Link>
            {role === "manager" ? (
              <Link href="/review" className={navLink}>
                담당자 확인
              </Link>
            ) : null}
          </nav>
        </div>
        <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
          <span data-testid="who" className="text-muted">
            {email} ({ROLE_LABELS[role]})
          </span>
          <button type="submit" className="btn">
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
