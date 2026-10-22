"use client";

import { useActionState, useState } from "react";
import { submitLogin, type LoginFormState } from "./actions";

const initialState: LoginFormState = { message: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(submitLogin, initialState);
  // 제출 뒤 입력칸이 비워지지 않게 이메일은 직접 들고 있는다. 비밀번호는 제출하면 비워져서 다시 입력하게 된다.
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"login" | "request">("login");
  const signup = mode === "request";

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div role="tablist" aria-label="로그인 방식" className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 text-sm font-semibold">
        <button
          type="button"
          role="tab"
          aria-selected={!signup}
          onClick={() => setMode("login")}
          className={`rounded-full px-3 py-2 ${!signup ? "bg-white text-brand shadow-sm" : "text-muted"}`}
        >
          로그인
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={signup}
          onClick={() => setMode("request")}
          className={`rounded-full px-3 py-2 ${signup ? "bg-white text-brand shadow-sm" : "text-muted"}`}
        >
          가입 신청
        </button>
      </div>

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
      <label className="flex flex-col gap-2 text-sm font-semibold">
        비밀번호
        <input
          name="password"
          type="password"
          required
          minLength={signup ? 10 : undefined}
          autoComplete={signup ? "new-password" : "current-password"}
          className="input font-normal"
        />
      </label>
      {signup ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          비밀번호 확인
          <input name="passwordConfirm" type="password" required autoComplete="new-password" className="input font-normal" />
        </label>
      ) : null}

      <button type="submit" name="intent" value={signup ? "request" : "login"} disabled={pending} className="btn btn-primary py-3 text-base">
        {pending ? "확인 중..." : signup ? "가입 신청" : "로그인"}
      </button>

      {state.message ? (
        <p role="status" className="rounded-xl bg-panel px-4 py-3 text-sm">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-muted">
          {signup
            ? "이메일과 비밀번호(10자 이상)를 정해 신청하면, 담당자가 승인한 뒤부터 로그인할 수 있어요."
            : "가입 신청을 하고 담당자가 승인하면 이메일과 비밀번호로 로그인할 수 있어요."}
        </p>
      )}
      <p className="text-xs text-muted">
        입력한 이메일은 접속 승인 확인과 작업 기록에만 쓰고, 승인되지 않은 신청은 대기 14일·거절 30일 뒤 계정과 함께 자동으로 지워요.
        비밀번호는 암호화되어 저장돼요.
      </p>
    </form>
  );
}
