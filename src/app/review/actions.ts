"use server";

// Design Ref: §1.3 담당자 확인 화면 — [그대로 올리기](작업 9), 로그인 신청 [승인]·[거절]
// 서버 함수는 화면을 거치지 않고도 불릴 수 있어서, 모든 함수가 맨 앞에서 담당자인지 다시 확인한다.
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/guard";
import { approveRequest, rejectRequest } from "@/lib/db/access-requests";
import { ROLES, type Role } from "@/lib/db/types";
import { releaseHeldRate } from "@/lib/reports/queries";

/** 폼에서 온 번호를 안전하게 정수로. 이상한 값이면 null. */
function parseId(value: FormDataEntryValue | null): number | null {
  return typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

/** 보류된 값을 그대로 올린다. 담당자만 할 수 있다. */
export async function releaseHold(formData: FormData): Promise<void> {
  const user = await requireManager();
  const id = parseId(formData.get("id"));
  if (id === null) return;

  await releaseHeldRate(id, user.id);
  revalidatePath("/review");
  revalidatePath("/reports");
}

/** 로그인 신청을 승인한다. 열람자로 할지 담당자로 할지는 담당자가 정한다. */
export async function approveLogin(formData: FormData): Promise<void> {
  const user = await requireManager();
  const id = parseId(formData.get("id"));
  const role = formData.get("role");
  // 역할은 정해진 두 값만 받는다. 그 밖의 값은 아무 일도 하지 않는다.
  if (id === null || typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return;

  await approveRequest(id, role as Role, user.id);
  revalidatePath("/review");
}

/** 로그인 신청을 거절한다. */
export async function rejectLogin(formData: FormData): Promise<void> {
  const user = await requireManager();
  const id = parseId(formData.get("id"));
  if (id === null) return;

  await rejectRequest(id, user.id);
  revalidatePath("/review");
}
