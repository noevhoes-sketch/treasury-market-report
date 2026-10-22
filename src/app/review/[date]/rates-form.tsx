"use client";

import { useActionState } from "react";
import { submitManualRates, type RatesFormState } from "./rates-actions";

const initial: RatesFormState = { kind: "idle", message: null };

const FIELDS = [
  { name: "kr3", label: "국고 3년" },
  { name: "kr10", label: "국고 10년" },
  { name: "kr30", label: "국고 30년" },
  { name: "us10", label: "미국 10년" },
] as const;

export function RatesForm({ date, usDefault, locked }: { date: string; usDefault: string; locked: Partial<Record<string, boolean>> }) {
  const [state, formAction, pending] = useActionState(submitManualRates, initial);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.name} className="flex flex-col gap-1 text-sm font-bold">
            {field.label} (%)
            <input
              name={field.name}
              inputMode="decimal"
              placeholder={locked[field.name] ? "자동 수집됨" : "예: 3.822"}
              disabled={locked[field.name] === true}
              autoComplete="off"
              className="input font-normal disabled:cursor-not-allowed disabled:bg-surface"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm font-bold">
          미국 기준일
          <input name="usDate" type="date" defaultValue={usDefault} className="input font-normal" />
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "저장 중..." : "직접 입력 저장"}
        </button>
      </div>
      {state.message ? (
        <p
          role={state.kind === "error" ? "alert" : "status"}
          className={state.kind === "error" ? "text-sm font-semibold text-red-700" : "text-sm font-semibold text-[#1b6b34]"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
