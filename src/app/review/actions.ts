"use server";

// Design Ref: §1.3 담당자 확인 화면 [그대로 올리기] — 누가 언제 풀어 줬는지 기록한다 (작업 9)
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/guard";
import { releaseHeldRate } from "@/lib/reports/queries";

/** 보류된 값을 그대로 올린다. 담당자만 할 수 있다. 서버 함수는 화면을 거치지 않고도 불릴 수 있어서 권한을 여기서도 확인한다. */
export async function releaseHold(formData: FormData): Promise<void> {
  const user = await requireManager();

  const raw = formData.get("id");
  const id = typeof raw === "string" && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
  if (id === null) return;

  await releaseHeldRate(id, user.id);
  revalidatePath("/review");
  revalidatePath("/reports");
}
