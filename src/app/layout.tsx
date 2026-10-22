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
        {children}
      </body>
    </html>
  );
}
