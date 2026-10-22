"use server";

// Design Ref: §1.3 담당자 확인 화면 — 금리 직접 입력 [저장]
// 서버 함수는 화면을 거치지 않고도 불릴 수 있어서, 맨 앞에서 담당자인지 다시 확인한다.
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/guard";
import { createServiceClient } from "@/lib/db/server";
import { saveManualRates } from "@/lib/rates/manual";
import { isValidDateString } from "@/lib/rates/validate";

export type RatesFormState = { kind: "idle" | "ok" | "error"; message: string | null };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.slice(0, 20) : "";
}

export async function submitManualRates(
  _previous: RatesFormState,
  formData: FormData,
): Promise<RatesFormState> {
  const user = await requireManager();

  const date = text(formData.get("date"));
  if (!isValidDateString(date)) return { kind: "error", message: "날짜가 올바르지 않습니다." };

  try {
    const result = await saveManualRates(createServiceClient(), {
      date,
      values: {
        kr3: text(formData.get("kr3")),
        kr10: text(formData.get("kr10")),
        kr30: text(formData.get("kr30")),
        us10: text(formData.get("us10")),
      },
      usDate: text(formData.get("usDate")),
    }, user.id);
    if (!result.ok) return { kind: "error", message: result.reason };

    revalidatePath(`/review/${date}`);
    revalidatePath(`/reports/${date}`);
    revalidatePath("/reports");
    return { kind: "ok", message: `${result.saved}개를 저장했어요. 금리가 바뀌면 이미 한 확정은 풀려요.` };
  } catch (error) {
    console.error("금리 직접 입력 실패:", error instanceof Error ? error.message : error);
    return { kind: "error", message: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
}
