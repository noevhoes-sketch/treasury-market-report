-- CHECK.md 1순위 3번·5번 수정 (0001이 이미 적용된 데이터베이스에 더하는 변경)
--
-- 3번) 담당자가 직접 넣은 값 위에 자동 수집이 같은 값을 다시 쓰면 오류가 났다.
--      자동 수집은 is_manual을 보내지 않아 값은 "직접 입력"인데 출처만 "금융투자협회"로 바뀌어 규칙(is_manual = (source = '담당자 직접 입력'))에 걸렸다.
--      이제 직접 입력 줄에 직접 입력이 아닌 출처로 쓰려는 시도는 어떤 경우든 기존 줄을 그대로 돌려준다.
-- 5번) 금리가 바뀔 때 확정을 풀 보고서를 날짜가 같은 한 건만 찾았다.
--      미국 값은 그 날짜 "다음 한국 영업일" 보고서에 쓰이고, 국고채 값은 그날 보고서와 다음 영업일 보고서("전일" 칸)에 쓰인다.

create or replace function keep_manual_rate() returns trigger
language plpgsql as $$
begin
  if old.is_manual and new.source <> '담당자 직접 입력' then
    return old;
  end if;
  return new;
end;
$$;

-- 한국 다음 영업일(주말과 holidays의 한국 휴장일을 건너뛴다). 최대 15일까지만 찾는다.
create or replace function next_kr_business_day(d date) returns date
language plpgsql stable as $$
declare
  n date := d + 1;
begin
  for i in 1..15 loop
    if extract(isodow from n) < 6
       and not exists (select 1 from holidays where market = 'kr' and holiday_date = n) then
      return n;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function unconfirm_report_on_rate_change() returns trigger
language plpgsql as $$
declare
  lo date;
  hi date;
begin
  if new.instrument = 'us10' then
    -- 미국 값(미국 날짜 U)은 U 다음 한국 영업일 보고서의 "금일", 그다음 영업일 보고서의 "전일"로 쓰인다.
    lo := new.rate_date + 1;
    hi := next_kr_business_day(next_kr_business_day(new.rate_date));
  else
    -- 국고채 값(한국 날짜 D)은 D 보고서의 "금일"과 다음 영업일 보고서의 "전일"로 쓰인다.
    lo := new.rate_date;
    hi := next_kr_business_day(new.rate_date);
  end if;

  update reports
     set confirmed_by = null,
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
