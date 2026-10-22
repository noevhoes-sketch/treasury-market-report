import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  isBusinessDay,
  previousBusinessDay,
  todayInKorea,
  toHolidaySet,
} from "@/lib/calc/business-days";
import { requireUser } from "@/lib/auth/guard";
import { fetchKrHolidaysAround } from "@/lib/reports/queries";

// Design Ref: §1.2 `/` (오늘 보고서) — 오늘이 영업일이면 오늘, 아니면 직전 영업일의 보고서로 보낸다.
async function Today(): Promise<never> {
  // 요청이 올 때마다 새로 정하는 화면이라는 것을 먼저 알린다(오늘 날짜와 로그인 정보는 요청마다 다르다).
  await connection();
  await requireUser();

  const today = todayInKorea();
  const holidays = toHolidaySet(await fetchKrHolidaysAround(today), "kr");
  const target = isBusinessDay(today, holidays) ? today : previousBusinessDay(today, holidays);
  redirect(`/reports/${target}`);
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Today />
    </Suspense>
  );
}
