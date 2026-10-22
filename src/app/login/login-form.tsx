"use client";

import { useActionState } from "react";
import { requestLoginLink, type LoginFormState } from "./actions";

const initialState: LoginFormState = { message: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestLoginLink,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        이메일
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@example.com"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "보내는 중..." : "로그인 링크 받기"}
      </button>
      {state.message ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-zinc-500">
          허용된 이메일만 들어올 수 있어요.
        </p>
      )}
    </form>
  );
}
