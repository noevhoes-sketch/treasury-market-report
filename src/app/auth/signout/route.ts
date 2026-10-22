// Design Ref: §1.2 맨 위 띠의 [로그아웃] 버튼이 부르는 곳
import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/auth/session";

// 로그아웃은 주소를 눌러서가 아니라 버튼(POST)으로만 한다.
export async function POST(request: Request) {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin), {
    status: 303,
  });
}
