import Image from "next/image";
import Link from "next/link";

/**
 * 맨 위 왼쪽에 고정되는 로고. 누르면 처음 홈("/")으로 돌아간다.
 * 로고 파일(public/logo.svg)은 재정경제부 누리집(mofe.go.kr/images/2026/logo.svg)에서 받은 것이다.
 */
export function SiteLogo() {
  return (
    <Link href="/" aria-label="재정경제부 로고 — 처음 홈으로 가기" className="flex shrink-0 items-center gap-3">
      <Image
        src="/logo.svg"
        alt="재정경제부"
        width={167}
        height={48}
        priority
        // SVG 그림은 그대로 보여준다(크기 변환이 필요 없다).
        unoptimized
        className="h-10 w-auto"
      />
      <span className="hidden border-l border-line pl-3 text-base font-bold text-ink sm:inline">국채시장 동향</span>
    </Link>
  );
}
