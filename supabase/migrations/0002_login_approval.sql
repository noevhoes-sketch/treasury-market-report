-- 로그인 신청과 담당자 승인: 신청하면 "승인 대기"로 들어가고, 담당자가 승인하면 그 이메일만으로 로그인할 수 있다.
-- (0001이 이미 적용된 데이터베이스에 더하는 변경이라 새 파일로 만든다)

alter table allowed_users
  add column if not exists status       text        not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),   -- pending 승인 대기 / approved 승인 / rejected 거절
  add column if not exists requested_at timestamptz not null default now(),   -- 신청한 시각
  add column if not exists approved_by  bigint references allowed_users(id),  -- 승인(또는 거절)한 사람의 번호
  add column if not exists approved_at  timestamptz;                           -- 승인(또는 거절)한 시각

-- 이미 있던 사람(담당자가 직접 넣은 사람)은 승인된 것으로 본다.
update allowed_users set approved_at = coalesce(approved_at, requested_at) where status = 'approved' and approved_at is null;

-- 승인된 사람에게는 승인 시각이 반드시 있어야 한다.
alter table allowed_users drop constraint if exists allowed_users_approved_has_time;
alter table allowed_users add constraint allowed_users_approved_has_time
  check (status <> 'approved' or approved_at is not null);

-- 승인 상태로 바로 넣을 때(담당자가 직접 등록하는 경우)에는 승인 시각을 자동으로 채운다.
create or replace function fill_approved_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' and new.approved_at is null then
    new.approved_at = now();
  end if;
  return new;
end;
$$;

create or replace trigger allowed_users_fill_approved_at
  before insert or update on allowed_users
  for each row execute function fill_approved_at();
