"use server";

// Design Ref: §1.1 로그인 화면, §2.5 로그인 — 허용된 이메일에만 링크를 보내고, 화면 문구는 항상 같다
import { headers } from "next/headers";
import { LOGIN_NEUTRAL_MESSAGE, shouldSendLoginLink } from "@/lib/auth/access";
import { createSessionClient } from "@/lib/auth/session";
import { lookupAllowedUser } from "@/lib/db/allowed-users";

export type LoginFormState = { message: string | null };

export async function requestLoginLink(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formData.get("email");

  try {
    if (await shouldSendLoginLink(email, lookupAllowedUser)) {
      const headerList = await headers();
      const origin =
        headerList.get("origin") ??
        process.env.NEXT_PUBLIC_SITE_URL ??
        "http://localhost:3000";
      const supabase = await createSessionClient();
      await supabase.auth.signInWithOtp({
        email: String(email).trim().toLowerCase(),
        options: {
          // 새 가입을 만들지 않는다. 허용 목록에 있어도 계정이 없으면 만들어 주지 않는다.
          shouldCreateUser: false,
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
    }
  } catch {
    // 오류가 나도 목록 포함 여부나 내부 사정을 드러내지 않도록 같은 문구를 보여준다.
  }

  return { message: LOGIN_NEUTRAL_MESSAGE };
}
