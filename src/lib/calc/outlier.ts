// Design Ref: §2.1 ⑥ 이상값 점검 — 전일 대비 크게 어긋나는 값은 올리지 않고 담당자가 확인한 뒤에 올린다
// Plan 작업 9: PRD 5번 "크게 어긋남"의 기준은 개발 단계에서 정한다고 했다. 그 기준이 이 파일의 상수다.

import { changeInBp } from "./rates-format.ts";

/**
 * 전일 대비 이 폭(bp)을 넘으면 이상값으로 본다. 국채 10년물의 하루 변동은 보통 10bp 안팎이고
 * 큰 충격이 있던 날에도 20~30bp를 넘는 일이 드물어서 30bp로 정했다.
 * 너무 자주 걸리면 담당자가 번거롭고, 너무 느슨하면 잘못 읽은 값을 놓친다. 운영하면서 조정한다.
 */
export const OUTLIER_THRESHOLD_BP = 30;

/** 전일 값이 있고, 변동폭의 절댓값이 기준을 넘으면 true. 전일 값이 없으면 판단할 수 없으므로 false. */
export function isOutlier(
  current: number,
  previous: number | null,
  thresholdBp: number = OUTLIER_THRESHOLD_BP,
): boolean {
  const bp = changeInBp(current, previous);
  if (bp === null) return false;
  return Math.abs(bp) > thresholdBp;
}
