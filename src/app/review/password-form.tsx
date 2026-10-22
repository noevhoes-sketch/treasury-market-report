"use client";

import { useActionState } from "react";
import { resetPassword, type PasswordFormState } from "./actions";

const initial: PasswordFormState = { kind: "idle", message: null };

/** 승인된 사용자 한 명의 비밀번호를 담당자가 새로 정하는 작은 폼 */
export function PasswordForm({ id, email, role }: { id: number; email: string; role: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initial);
  return (
    <form action={formAction} className="flex flex-col gap-2 px-5 py-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <p>
        <strong>{email}</strong> <span className="text-muted">({role})</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="새 비밀번호(10자 이상)" aria-label={`${email} 새 비밀번호`} className="input" />
        <input name="passwordConfirm" type="password" required autoComplete="new-password" placeholder="새 비밀번호 확인" aria-label={`${email} 새 비밀번호 확인`} className="input" />
        <button type="submit" disabled={pending} className="btn">
          {pending ? "저장 중..." : "비밀번호 설정"}
        </button>
      </div>
      {state.message ? (
        <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "font-semibold text-red-700" : "font-semibold text-[#1b6b34]"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
