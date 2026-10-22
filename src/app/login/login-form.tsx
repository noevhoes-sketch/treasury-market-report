"use client";

import { useActionState, useState } from "react";
import { submitLogin, type LoginFormState } from "./actions";

const initialState: LoginFormState = { message: null, canRequest: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(submitLogin, initialState);
  // 제출 뒤 입력칸이 비워지지 않게 값을 직접 들고 있는다. (등록 신청 버튼이 같은 이메일을 다시 써야 한다)
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        이메일
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        확인 코드 <span className="font-normal text-zinc-500">(담당자만)</span>
        <input
          name="code"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </label>
      <button
        type="submit"
        name="intent"
        value="login"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "확인 중..." : "로그인"}
      </button>
      {state.canRequest ? (
        <button
          type="submit"
          name="intent"
          value="request"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60 dark:border-zinc-700"
        >
          등록 신청
        </button>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-zinc-500">
          처음이라면 이메일을 넣고 로그인을 눌러 등록을 신청해 주세요. 담당자가 승인하면 그다음부터는 이메일만 넣으면 들어와요.
        </p>
      )}
    </form>
  );
}
