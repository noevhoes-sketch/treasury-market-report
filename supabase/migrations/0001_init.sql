-- Design Ref: §3 저장할 데이터 — 금리, 보고서, 허용 목록, 휴장일 4개 표
-- Plan 작업 1: 보고서 데이터 구조와 저장소
-- 이 파일은 "설계도"일 뿐이다. Supabase 프로젝트에 적용하기 전에는 아무 일도 일어나지 않는다.

-- 1) 금리 한 줄: 하루·종목별로 한 줄씩 쌓는다.
--    전년말·전월말 값은 따로 저장하지 않고, 이 표에서 "직전 월·연의 마지막 영업일" 값을 찾아 쓴다.
create table if not exists rates (
  id            bigint generated always as identity primary key,
  rate_date     date        not null,                       -- 금리가 속한 날짜(보고서 날짜)
  instrument    text        not null
                check (instrument in ('kr3', 'kr10', 'kr30', 'us10')), -- 국고 3·10·30년, 미국 10년
  rate          numeric(6,3) not null,                      -- 출처 값 그대로, 소수 셋째 자리(예: 3.822)
  source        text        not null,                       -- 출처 이름(예: 금융투자협회, 미국 재무부)
  as_of_date    date        not null,                       -- 출처의 기준일(미국은 최신 마감일이라 rate_date와 다를 수 있음)
  collected_at  timestamptz not null default now(),         -- 수집한 시각
  unique (rate_date, instrument)                            -- 같은 날 같은 종목은 한 줄만, 재수집하면 덮어쓴다
);

-- 2) 보고서 한 건: 날짜별로 하나.
create table if not exists reports (
  report_date   date primary key,                           -- 보고서 날짜
  status        text not null default 'waiting'
                check (status in ('waiting', 'held', 'done', 'confirmed')),
                -- waiting 대기(값 아직 없음) / held 보류(이상값 확인 대기) / done 표 완료 / confirmed 담당자 확정
  cause_kr      text check (cause_kr is null or char_length(cause_kr) <= 60),  -- 국고채 등락 원인(60자 이내)
  cause_us      text check (cause_us is null or char_length(cause_us) <= 60),  -- 미국 금리 등락 원인(60자 이내)
  source_url    text,                                       -- 근거 기사 링크
  confirmed_by  text,                                       -- 확정한 사람의 이메일
  confirmed_at  timestamptz,                                -- 확정한 시각
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 확정된 보고서에는 확정한 사람과 시각이 반드시 있어야 한다.
  check (status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null))
);

-- 3) 허용 목록: 이 이메일만 로그인할 수 있다. 비밀번호는 저장하지 않는다.
create table if not exists allowed_users (
  email  text primary key,
  role   text not null check (role in ('manager', 'viewer'))  -- manager 담당자 / viewer 열람자
);

-- 4) 휴장일: 이 날은 보고서를 만들지 않는다.
create table if not exists holidays (
  holiday_date  date primary key,
  name          text not null
);

-- 서버 코드만 읽고 쓰게 한다. 보안 규칙을 켜 두고 공개 규칙은 만들지 않는다.
alter table rates         enable row level security;
alter table reports       enable row level security;
alter table allowed_users enable row level security;
alter table holidays      enable row level security;
