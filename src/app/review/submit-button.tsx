"use client";

import { useFormStatus } from "react-dom";

/**
 * 담당자 확인 화면의 승인·거절·그대로 올리기 버튼.
 * 누르면 처리하는 동안 "처리 중..."으로 바뀌고 잠겨서, 눌렸는지 바로 알 수 있고 같은 일을 여러 번 보내지 않는다.
 * (처리가 끝나면 화면이 다시 그려져서 그 줄이 목록에서 사라진다)
 */
export function SubmitButton({ children, pendingText = "처리 중..." }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn">
      {pending ? pendingText : children}
    </button>
  );
}
