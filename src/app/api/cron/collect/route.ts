// Design Ref: §4.4 자동 실행 주소 잠금, §2.1 금리 표 만들기(자동, 장 마감 후)
// Plan 작업 11: 장 마감 후 Vercel Cron이 이 주소를 불러 오늘 값을 받아 저장한다.
// 로그인 없이 불리는 주소라 CRON_SECRET이 맞을 때만 일한다(틀리면 아무 일도 하지 않고 401).
import { NextResponse } from "next/server";
import { todayInKorea } from "@/lib/calc/business-days";
import { verifyCronAuth } from "@/lib/auth/cron";
import { createServiceClient } from "@/lib/db/server";
import { collectDaily } from "@/lib/rates/collect-daily";

export async function GET(request: Request) {
  if (!verifyCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectDaily(createServiceClient(), todayInKorea());
    return NextResponse.json(result);
  } catch (error) {
    // 내부 사정(주소·키·쿼리)은 응답에 싣지 않고 서버 기록에만 남긴다.
    console.error("자동 수집 실패:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "collect failed" }, { status: 500 });
  }
}
