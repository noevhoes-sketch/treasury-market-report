// Design Ref: §4.3 비밀 값 관리 — 서버 전용 키(SUPABASE_SERVICE_ROLE_KEY)는 서버에서만 읽는다
// 맨 위의 server-only 덕분에 화면(브라우저) 코드에서 이 파일을 불러오면 빌드가 실패한다.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 데이터베이스 연결. 모든 권한을 가진 키를 쓰므로
 * 서버 코드(Route Handler, 서버 컴포넌트, 서버 함수)에서만 부른다.
 * 요청마다 새로 만들어도 부담이 작다.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    // 값은 오류 문구에 넣지 않는다. 어떤 항목이 비었는지만 알려준다.
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env에 없습니다.",
    );
  }
  return createClient(url, serviceRoleKey, {
    // 서버에서 쓰는 연결이라 로그인 세션을 저장하거나 갱신하지 않는다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
