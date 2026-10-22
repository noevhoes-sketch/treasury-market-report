// Design Ref: §2.5 로그인 — 링크를 눌러 세션이 만들어진 직후, 허용 목록을 한 번 더 확인하고 이동한다
import "server-only";

import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/access";
import { createSessionClient, getAccess } from "@/lib/auth/session";

/** 세션이 만들어졌다고 가정하고, 허용 목록에 있으면 목적지로, 없으면 로그아웃시키고 로그인 화면으로 보낸다. */
export async function finishLogin(requestUrl: URL, nextParam: string | null) {
  const access = await getAccess();
  if (!access.ok) {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=1", requestUrl.origin));
  }
  // 우리 사이트 안의 주소로만 돌려보낸다.
  return NextResponse.redirect(
    new URL(safeNextPath(nextParam), requestUrl.origin),
  );
}

export function loginFailed(requestUrl: URL) {
  return NextResponse.redirect(new URL("/login?error=1", requestUrl.origin));
}
