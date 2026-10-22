"use client";

import { useActionState, useState } from "react";
import { submitLogin, type LoginFormState } from "./actions";

const initialState: LoginFormState = { message: null, canRequest: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(submitLogin, initialState);
  // 제출 뒤 입력칸이 비워지지 않게 값을 직접 들고 있는다. (등록 신청 버튼이 같은 이메일을 다시 써야 한다)
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        이메일
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="input font-normal"
        />
      </label>
      <button type="submit" name="intent" value="login" disabled={pending} className="btn btn-primary py-3 text-base">
        {pending ? "확인 중..." : "로그인"}
      </button>
      {state.canRequest ? (
        <button type="submit" name="intent" value="request" disabled={pending} className="btn py-3 text-base">
          등록 신청
        </button>
      ) : null}
      {state.message ? (
        <p role="status" className="rounded-xl bg-panel px-4 py-3 text-sm">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-muted">
          처음이라면 이메일을 넣고 로그인을 눌러 등록을 신청해 주세요. 담당자가 승인하면 그다음부터는 이메일만 넣으면 들어와요.
        </p>
      )}
      <p className="text-xs text-muted">
        입력한 이메일은 접속 승인 확인과 작업 기록에만 쓰고, 승인되지 않은 신청은 대기 14일·거절 30일 뒤 자동으로 지워요.
      </p>
    </form>
  );
}
