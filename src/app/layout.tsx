import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "국채시장 동향",
  description: "국고채 마감 후 일일 보고서를 자동으로 만들어 주는 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* 맨 위 안내 띠: 정부24의 "공식 누리집" 안내 띠 자리. 이 서비스는 실습용이라는 점을 알린다. */}
        <div className="bg-surface text-[13px] text-ink">
          <p className="mx-auto max-w-6xl px-4 py-1.5">
            재정경제부 국고실 국채시장 동향 서비스 · 교육 실습용으로 만든 내부 서비스입니다.
          </p>
        </div>
        {children}
      </body>
    </html>
  );
}
