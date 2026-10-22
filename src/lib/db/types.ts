// Design Ref: §3 저장할 데이터 — supabase/migrations/0001_init.sql의 표와 1:1로 맞춘 타입
// Plan 작업 1: 보고서 데이터 구조와 저장소

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

/** 보고서 상태: 대기 → (보류) → 표 완료 → 확정 */
export const REPORT_STATUSES = ["waiting", "held", "done", "confirmed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  waiting: "대기 중",
  held: "확인 중",
  done: "표 완료",
  confirmed: "확정 완료",
};

/** 로그인 역할: 담당자 / 열람자 */
export const ROLES = ["manager", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  manager: "담당자",
  viewer: "열람자",
};

/** 등락 원인 한 줄의 최대 글자 수 (PRD 5번 규칙) */
export const CAUSE_MAX_LENGTH = 60;

/** 날짜는 "YYYY-MM-DD" 문자열로 다룬다. */
export type DateString = string;

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
};

/** 보고서 한 건 (표: reports) */
export type ReportRow = {
  report_date: DateString;
  status: ReportStatus;
  cause_kr: string | null;
  cause_us: string | null;
  source_url: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 허용 목록 한 줄 (표: allowed_users) */
export type AllowedUserRow = {
  email: string;
  role: Role;
};

/** 휴장일 한 줄 (표: holidays) */
export type HolidayRow = {
  holiday_date: DateString;
  name: string;
};
