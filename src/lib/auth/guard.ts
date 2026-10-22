// Design Ref: §4.5 담당자 권한은 서버에서 — 담당자만 할 수 있는 일의 맨 앞에서 항상 부른다
import "server-only";

import { redirect } from "next/navigation";
import { getAccess } from "./session";

/** 로그인한 사람이면 그 사람을, 아니면 로그인 화면으로 보낸다. */
export async function requireUser() {
  const access = await getAccess();
  if (!access.ok) redirect("/login");
  return access.user;
}

/**
 * 담당자만 통과. 열람자는 첫 화면으로, 로그인하지 않았거나 목록에서 지워진 사람은 로그인 화면으로 보낸다.
 * 화면(페이지)뿐 아니라 저장·확정을 처리하는 서버 함수(Server Action) 안에서도 반드시 부른다.
 */
export async function requireManager() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");
  return user;
}
