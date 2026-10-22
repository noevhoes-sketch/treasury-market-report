// Design Ref: §4.1 Proxy — 로그인 안 한 사람을 로그인 화면으로 돌려보낸다(간단한 1차 확인)
// 실제 권한 확인(허용 목록, 담당자 여부)은 각 페이지·서버 코드에서 getAccess()로 다시 한다.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // 설정이 빠졌으면 열어 두지 않고 모두 로그인 화면으로 보낸다.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
  cookieOptions: {
    // 이 앱은 브라우저에서 Supabase를 직접 쓰지 않으므로 자바스크립트가 쿠키를 읽을 필요가 없다. 로그인은 12시간만 유지한다.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 12,
    path: "/",
  },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser는 토큰을 서버에서 검증하고, 만료가 가까우면 세션을 갱신한다.
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // 로그인 화면, 로그인 확인 주소, 자동 실행 주소(자체 잠금 사용), 정적 파일은 제외한다.
  matcher: [
    // 로고 같은 그림 파일(public 폴더)은 로그인 화면에도 보여야 하므로 막지 않는다. (그림 파일에는 보고서 내용이 없다)
    "/((?!login|auth/callback|auth/confirm|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
