// Design Ref: §3 저장할 데이터 — supabase/migrations/0001_init.sql의 표와 1:1로 맞춘 타입
// Plan 작업 1: 보고서 데이터 구조와 저장소

// 날짜 타입은 한 곳(calc)에서만 정의하고 여기서는 다시 내보내기만 한다.
import type { DateString } from "../calc/business-days";
export type { DateString };

/** 금리 종목: 국고채 3·10·30년, 미국 10년 */
export const INSTRUMENTS = ["kr3", "kr10", "kr30", "us10"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** 화면에 보여줄 종목 이름 */
export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  kr3: "국고 3년",
  kr10: "국고 10년",
  kr30: "국고 30년",
  us10: "미국 10년",
};

/** 종목이 속한 시장: 영업일·휴장일 계산에 쓴다 (국고채는 한국, 미국 10년은 미국) */
export const MARKETS = ["kr", "us"] as const;
export type Market = (typeof MARKETS)[number];

export const INSTRUMENT_MARKET: Record<Instrument, Market> = {
  kr3: "kr",
  kr10: "kr",
  kr30: "kr",
  us10: "us",
};

/** 직접 입력한 값의 출처 이름. DB도 같은 값으로 검사한다. */
export const MANUAL_SOURCE = "담당자 직접 입력";

/** 금리 표 상태: 대기 → 완료 */
export const TABLE_STATUSES = ["waiting", "done"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  waiting: "대기 중",
  done: "표 완료",
};

/** 등락 원인 한 줄의 상태 (국고채·미국이 각각 따로 가진다) */
export const CAUSE_STATUSES = [
  "waiting_article",
  "no_source",
  "draft",
  "stale",
] as const;
export type CauseStatus = (typeof CAUSE_STATUSES)[number];

export const CAUSE_STATUS_LABELS: Record<CauseStatus, string> = {
  waiting_article: "기사 대기 중",
  no_source: "근거 기사 없음",
  draft: "초안, 담당자 확인 필요",
  stale: "숫자가 바뀌어 다시 확인 필요",
};

/** 로그인 역할: 담당자 / 열람자 */
export const ROLES = ["manager", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  manager: "담당자",
  viewer: "열람자",
};

/** 등락 원인 한 줄의 최대 글자 수 (공백 포함, PRD 5번 규칙) */
export const CAUSE_MAX_LENGTH = 60;

/** 금리 한 줄 (표: rates) */
export type RateRow = {
  id: number;
  rate_date: DateString;
  instrument: Instrument;
  /** 출처 값 그대로, 소수 셋째 자리 */
  rate: number;
  source: string;
  /** 출처의 기준일 (미국은 최신 마감일이라 rate_date와 다를 수 있음) */
  as_of_date: DateString;
  collected_at: string;
  /** 담당자가 직접 넣은 값인가 (자동 수집이 덮어쓰지 못한다) */
  is_manual: boolean;
  /** 이상값이라 보류 중인가 (값 단위) */
  held: boolean;
  /** 보류를 풀어 준 사람의 허용 목록 번호 */
  held_released_by: number | null;
  held_released_at: string | null;
};

/** 보고서 한 건 (표: reports). 확정은 confirmed_at이 있는가로 판단한다. */
export type ReportRow = {
  report_date: DateString;
  table_status: TableStatus;
  cause_status_kr: CauseStatus;
  cause_status_us: CauseStatus;
  cause_kr: string | null;
  cause_us: string | null;
  source_url_kr: string | null;
  source_url_us: string | null;
  has_manager_edit: boolean;
  /** 확정한 사람의 허용 목록 번호 (이메일은 보고서에 남기지 않는다) */
  confirmed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 허용 목록 한 줄 (표: allowed_users) */
export type AllowedUserRow = {
  id: number;
  email: string;
  role: Role;
};

/** 휴장일 한 줄 (표: holidays) */
export type HolidayRow = {
  market: Market;
  holiday_date: DateString;
  name: string;
};

/** 확정되었는가? (확정 시각이 있으면 확정) */
export function isConfirmed(report: Pick<ReportRow, "confirmed_at">): boolean {
  return report.confirmed_at !== null;
}
