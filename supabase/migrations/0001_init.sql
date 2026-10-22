-- Design Ref: §3 저장할 데이터 — 금리, 보고서, 허용 목록, 휴장일 4개 표
-- Plan 작업 1: 보고서 데이터 구조와 저장소
-- 이 파일은 "설계도"일 뿐이다. Supabase 프로젝트에 적용하기 전에는 아무 일도 일어나지 않는다.
-- (아직 어디에도 적용하지 않았으므로 새 파일을 만들지 않고 이 파일을 고쳐서 쓴다)

-- 1) 허용 목록: 이 이메일만 로그인할 수 있다. 비밀번호는 저장하지 않는다.
--    번호(id)를 두는 이유: 보고서에는 이메일 대신 이 번호만 남겨서 개인정보를 분리한다.
create table if not exists allowed_users (
  id     bigint generated always as identity primary key,
  email  text   not null unique check (email = lower(email)),
  role   text   not null check (role in ('manager', 'viewer'))  -- manager 담당자 / viewer 열람자
);

-- 2) 금리 한 줄: 하루·종목별로 한 줄씩 쌓는다.
--    전년말·전월말 값은 따로 저장하지 않고, 이 표에서 "직전 월·연의 마지막 영업일" 값을 찾아 쓴다.
create table if not exists rates (
  id               bigint generated always as identity primary key,
  rate_date        date         not null,                    -- 금리가 속한 날짜(보고서 날짜)
  instrument       text         not null
                   check (instrument in ('kr3', 'kr10', 'kr30', 'us10')), -- 국고 3·10·30년, 미국 10년
  rate             numeric(6,3) not null,                    -- 출처 값 그대로, 소수 셋째 자리(예: 3.822)
  source           text         not null,                    -- 출처 이름(예: 금융투자협회, 미국 재무부, 담당자 직접 입력)
  as_of_date       date         not null,                    -- 출처의 기준일(미국은 최신 마감일이라 rate_date와 다를 수 있음)
  collected_at     timestamptz  not null default now(),      -- 수집한 시각
  is_manual        boolean      not null default false,      -- 담당자가 직접 넣은 값인가
  held             boolean      not null default false,      -- 이상값이라 보류 중인가(값 단위)
  held_released_by bigint references allowed_users(id),      -- 보류를 풀어 준 사람
  held_released_at timestamptz,                              -- 보류를 풀어 준 시각
  unique (rate_date, instrument),                            -- 같은 날 같은 종목은 한 줄만, 재수집하면 덮어쓴다
  check (is_manual = (source = '담당자 직접 입력')),          -- 직접 입력 값은 출처가 항상 "담당자 직접 입력"
  check ((held_released_by is null) = (held_released_at is null))
);

-- 3) 보고서 한 건: 날짜별로 하나.
--    확정은 별도 상태값이 아니라 "확정 시각이 있는가"로 판단한다.
create table if not exists reports (
  report_date       date primary key,                        -- 보고서 날짜
  table_status      text not null default 'waiting'
                    check (table_status in ('waiting', 'done')),  -- 금리 표: 대기 / 완료
  cause_status_kr   text not null default 'waiting_article'
                    check (cause_status_kr in ('waiting_article', 'no_source', 'draft', 'stale')),
  cause_status_us   text not null default 'waiting_article'
                    check (cause_status_us in ('waiting_article', 'no_source', 'draft', 'stale')),
                    -- waiting_article 기사 대기 중 / no_source 근거 기사 없음 / draft 초안 / stale 숫자 바뀜(다시 확인 필요)
  cause_kr          text,                                    -- 국고채 등락 원인
  cause_us          text,                                    -- 미국 금리 등락 원인
  source_url_kr     text check (source_url_kr is null or source_url_kr ~ '^https://'),  -- 국고채 근거 기사 링크
  source_url_us     text check (source_url_us is null or source_url_us ~ '^https://'),  -- 미국 근거 기사 링크
  has_manager_edit  boolean not null default false,          -- 담당자가 고친 적이 있는가
  confirmed_by      bigint references allowed_users(id),     -- 확정한 사람(이메일이 아니라 번호만)
  confirmed_at      timestamptz,                             -- 확정한 시각
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 원인 문장은 공백을 포함해 60자 이내(PRD 5번 규칙, char_length는 공백도 센다)
  check (cause_kr is null or char_length(cause_kr) <= 60),
  check (cause_us is null or char_length(cause_us) <= 60),
  -- 확정한 사람과 시각은 함께 있거나 함께 없어야 한다.
  check ((confirmed_by is null) = (confirmed_at is null)),
  -- "숫자 바뀜" 상태인 원인이 있으면 확정할 수 없다.
  check (confirmed_at is null or (cause_status_kr <> 'stale' and cause_status_us <> 'stale'))
);

-- 4) 휴장일: 이 날은 보고서를 만들지 않는다. 한국과 미국은 쉬는 날이 달라 시장별로 따로 둔다.
create table if not exists holidays (
  market        text not null check (market in ('kr', 'us')),  -- kr 한국 / us 미국
  holiday_date  date not null,
  name          text not null,
  primary key (market, holiday_date)
);

-- ── 자동으로 지켜 주는 규칙 ──────────────────────────────────────────

-- (가) reports.updated_at을 수정할 때마다 자동으로 갱신한다.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on reports;
create trigger reports_set_updated_at
  before update on reports
  for each row execute function set_updated_at();

-- (나) 자동 수집이 담당자가 직접 넣은 값을 덮어쓰지 못하게 한다. (DESIGN §1.3)
--     자동 수집이 같은 날·같은 종목에 다시 쓰려고 하면 기존 값을 그대로 둔다.
create or replace function keep_manual_rate() returns trigger
language plpgsql as $$
begin
  if old.is_manual and not new.is_manual then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists rates_keep_manual on rates;
create trigger rates_keep_manual
  before update on rates
  for each row execute function keep_manual_rate();

-- (다) 재수집으로 금리가 바뀌면 확정을 풀고 원인을 "숫자 바뀜"으로 바꾼다. (PRD 4번 재수집 규칙)
--     값이 같으면 아무것도 하지 않아서 확정이 그대로 유지된다.
--     국고 3·10·30년은 국고채 원인 줄, 미국 10년은 미국 원인 줄에 영향을 준다.
create or replace function unconfirm_report_on_rate_change() returns trigger
language plpgsql as $$
begin
  update reports
     set confirmed_by = null,
         confirmed_at = null,
         cause_status_kr = case
           when new.instrument in ('kr3', 'kr10', 'kr30') and cause_status_kr = 'draft'
             then 'stale' else cause_status_kr end,
         cause_status_us = case
           when new.instrument = 'us10' and cause_status_us = 'draft'
             then 'stale' else cause_status_us end
   where report_date = new.rate_date;
  return new;
end;
$$;

drop trigger if exists rates_unconfirm_report on rates;
create trigger rates_unconfirm_report
  after update of rate on rates
  for each row
  when (old.rate is distinct from new.rate)
  execute function unconfirm_report_on_rate_change();

-- 서버 코드만 읽고 쓰게 한다. 보안 규칙을 켜 두고 공개 규칙은 만들지 않는다.
-- (열람자에게는 표 직접 읽기 권한을 주지 않고, 서버가 걸러서 넘긴다. DESIGN §4.5)
alter table rates         enable row level security;
alter table reports       enable row level security;
alter table allowed_users enable row level security;
alter table holidays      enable row level security;
