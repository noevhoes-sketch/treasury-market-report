// Design Ref: §4.4 자동 실행 주소 잠금, §2.2 등락 원인 초안 (자동, 기사가 올라온 뒤)
// Plan 작업 12: 장 마감 기사([채권-마감])가 올라온 뒤(18:30 이후) 이 주소가 불려 원인 초안을 만든다.
// 로그인 없이 불리는 주소라 CRON_SECRET이 맞을 때만 일한다(틀리면 아무 일도 하지 않고 401).
import { NextResponse } from "next/server";
import { todayInKorea } from "@/lib/calc/business-days";
import { verifyCronAuth } from "@/lib/auth/cron";
import { generateCauseDraft } from "@/lib/cause/collect-cause";
import { createServiceClient } from "@/lib/db/server";

export async function GET(request: Request) {
  if (!verifyCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateCauseDraft(createServiceClient(), todayInKorea(), {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    // 내부 사정(주소·키·쿼리)은 응답에 싣지 않고 서버 기록에만 남긴다.
    console.error("원인 초안 실패:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "cause failed" }, { status: 500 });
  }
}
