"use client";

import { useActionState, useState } from "react";
import { submitCauses, type CauseFormState } from "./actions";

const MAX = 60;
const initial: CauseFormState = { kind: "idle", message: null };

type Props = {
  date: string;
  kr: string;
  us: string;
  /** 줄별 상태 안내 문구(예: "초안, 담당자 확인 필요") */
  krLabel: string;
  usLabel: string;
  krUrl: string | null;
  usUrl: string | null;
};

function Line({
  name,
  title,
  value,
  onChange,
  label,
  url,
}: {
  name: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  url: string | null;
}) {
  const count = Array.from(value).length;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {title} <span className="font-normal text-zinc-500">({label})</span>
      </label>
      <textarea
        id={name}
        name={name}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={count > MAX ? "font-semibold text-red-600" : "text-zinc-500"}>
          {count}/{MAX}자 (공백 포함)
        </span>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline dark:text-blue-300">
            근거 기사 보기
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function CauseForm({ date, kr, us, krLabel, usLabel, krUrl, usUrl }: Props) {
  const [state, formAction, pending] = useActionState(submitCauses, initial);
  const [krText, setKrText] = useState(kr);
  const [usText, setUsText] = useState(us);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />
      <Line name="kr" title="국고채" value={krText} onChange={setKrText} label={krLabel} url={krUrl} />
      <Line name="us" title="미국 금리" value={usText} onChange={setUsText} label={usLabel} url={usUrl} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60 dark:border-zinc-700"
        >
          저장
        </button>
        <button
          type="submit"
          name="intent"
          value="confirm"
          disabled={pending}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
        >
          확정
        </button>
      </div>
      {state.message ? (
        <p
          role={state.kind === "error" ? "alert" : "status"}
          className={state.kind === "error" ? "text-sm text-red-600" : "text-sm text-green-700 dark:text-green-400"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
