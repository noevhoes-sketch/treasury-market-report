-- CHECK.md 2순위 수정 (0004까지 적용된 데이터베이스에 더하는 변경)
--  9번) 허용 목록 status 기본값을 'approved'에서 'pending'으로: status 없이 넣은 줄이 바로 승인되지 않게 한다.
--  16번) 누가 했는지 남긴다: rates.entered_by(직접 입력한 사람), reports.edited_by(원인 문장 고친 사람), allowed_users.last_login_at(마지막 로그인 시각).
--  19번·20번) 보류를 풀거나 새 값이 들어와도 확정이 풀리게 한다.
--  29번) 확정이 풀린 시각(unconfirmed_at)을 남겨, 담당자 화면에서 "금리가 바뀌어 확정이 풀렸다"고 알려 줄 수 있게 한다.

alter table allowed_users alter column status set default 'pending';

alter table allowed_users add column if not exists last_login_at timestamptz;
alter table rates         add column if not exists entered_by bigint references allowed_users(id);
alter table reports       add column if not exists edited_by bigint references allowed_users(id);
alter table reports       add column if not exists unconfirmed_at timestamptz;

-- 확정을 푸는 함수(0004와 같고, 확정이 풀릴 때 unconfirmed_at을 남긴다)
create or replace function unconfirm_report_on_rate_change() returns trigger
language plpgsql as $$
declare
  lo date;
  hi date;
begin
  if new.instrument = 'us10' then
    lo := new.rate_date + 1;
    hi := next_kr_business_day(next_kr_business_day(new.rate_date));
  else
    lo := new.rate_date;
    hi := next_kr_business_day(new.rate_date);
  end if;

  update reports
     set unconfirmed_at = case when confirmed_at is not null then now() else unconfirmed_at end,
         confirmed_by = null,
         confirmed_at = null,
         cause_status_kr = case
           when new.instrument in ('kr3', 'kr10', 'kr30') and cause_status_kr = 'draft'
             then 'stale' else cause_status_kr end,
         cause_status_us = case
           when new.instrument = 'us10' and cause_status_us = 'draft'
             then 'stale' else cause_status_us end
   where report_date between lo and hi;
  return new;
end;
$$;

-- 20번) 확정 뒤에 처음 들어온 값(새 줄)도 확정을 푼다.
drop trigger if exists rates_unconfirm_on_insert on rates;
create trigger rates_unconfirm_on_insert
  after insert on rates
  for each row execute function unconfirm_report_on_rate_change();

-- 19번) 보류를 풀거나 새로 보류가 걸려 표에 보이는 값이 바뀌면 확정을 푼다.
drop trigger if exists rates_unconfirm_on_hold_change on rates;
create trigger rates_unconfirm_on_hold_change
  after update of held on rates
  for each row
  when (old.held is distinct from new.held)
  execute function unconfirm_report_on_rate_change();
