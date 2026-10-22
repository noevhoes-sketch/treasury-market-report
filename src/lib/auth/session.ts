// Design Ref: §2.5 로그인 — 로그인 세션(쿠키)을 읽고, 허용 목록으로 다시 확인한다
// 서버에서만 쓴다. 화면 코드에서 불러오면 server-only 때문에 빌드가 실패한다.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { lookupAllowedUser } from "../db/allowed-users";
import { resolveAccess, type AccessResult } from "./access";

/**
 * 로그인 세션을 다루는 서버용 연결. 공개 키(anon)를 쓰고 세션은 쿠키에 저장한다.
 * (허용 목록 같은 표를 읽는 연결은 db/server.ts의 서버 전용 키를 쓴다)
 */
export async function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 .env에 없습니다.",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트처럼 쿠키를 쓸 수 없는 곳에서는 무시한다.
          // 세션 갱신은 proxy.ts가 맡는다.
        }
      },
    },
  });
}

/**
 * 요청마다 부른다. 세션이 있는지 확인(getUser는 토큰을 서버에서 검증한다)하고,
 * 그 이메일이 지금도 허용 목록에 있는지 다시 확인한다. 역할은 허용 목록에서만 가져온다.
 */
export async function getAccess(): Promise<AccessResult> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  return resolveAccess(data.user?.email, lookupAllowedUser);
}
