"use server";

// Design Ref: §1.3 담당자 확인 화면 — 원인 문장 [저장]·[확정]
// 서버 함수는 화면을 거치지 않고도 불릴 수 있어서, 맨 앞에서 담당자인지 다시 확인한다.
import { revalidatePath } from "next/cache";
import { buildReportTable } from "@/lib/calc/rates-format";
import { pickReportInputs } from "@/lib/calc/report-table";
import { requireManager } from "@/lib/auth/guard";
import { createServiceClient } from "@/lib/db/server";
import { isValidDateString } from "@/lib/rates/validate";
import { confirmReport, saveManagerCauses } from "@/lib/reports/cause-store";
import { fetchKrHolidaySet, fetchRatesForReport } from "@/lib/reports/queries";

export type CauseFormState = { kind: "idle" | "ok" | "error"; message: string | null };

/** 폼에서 온 글을 안전하게 문자열로. 너무 긴 글은 검사 전에 잘라 낸다(검사에서 60자 초과로 걸러진다). */
function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.slice(0, 500) : "";
}

export async function submitCauses(
  _previous: CauseFormState,
  formData: FormData,
): Promise<CauseFormState> {
  const user = await requireManager();

  const date = text(formData.get("date"));
  if (!isValidDateString(date)) return { kind: "error", message: "날짜가 올바르지 않습니다." };
  const intent = formData.get("intent") === "confirm" ? "confirm" : "save";

  try {
    const rows = buildReportTable(pickReportInputs(await fetchRatesForReport(date), date, await fetchKrHolidaySet(date)));
    const client = createServiceClient();

    // 화면에 보이는 문장이 그대로 저장·확정되도록, 확정할 때도 먼저 저장한다.
    const saved = await saveManagerCauses(
      client,
      date,
      { kr: text(formData.get("kr")), us: text(formData.get("us")) },
      rows,
      user.id,
    );
    if (!saved.ok) return { kind: "error", message: saved.reason };

    if (intent === "confirm") {
      const confirmed = await confirmReport(client, date, user.id);
      revalidatePath(`/review/${date}`);
      revalidatePath(`/reports/${date}`);
      revalidatePath("/reports");
      if (!confirmed.ok) {
        return { kind: "error", message: `저장은 했지만 확정하지 못했어요. ${confirmed.reason}` };
      }
      return { kind: "ok", message: "확정했어요. 이제 열람자에게 원인이 보여요." };
    }

    revalidatePath(`/review/${date}`);
    revalidatePath(`/reports/${date}`);
    return { kind: "ok", message: "저장했어요. 확정하려면 [확정]을 눌러 주세요." };
  } catch (error) {
    // 내부 사정은 화면에 싣지 않고 서버 기록에만 남긴다.
    console.error("원인 저장 실패:", error instanceof Error ? error.message : error);
    return { kind: "error", message: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
}
