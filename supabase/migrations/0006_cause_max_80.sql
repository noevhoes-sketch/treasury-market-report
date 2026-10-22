-- 등락 원인 문장 길이 제한을 공백 포함 60자에서 80자로 늘린다(사용자 결정 2026-10-22).
-- 0001에서 이름 없이 만든 길이 규칙(char_length(cause_kr/cause_us) <= 60)을 찾아 지우고, 이름 있는 새 규칙(80자)으로 바꾼다.

do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'reports'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%char_length(cause_%'
  loop
    execute format('alter table reports drop constraint %I', c.conname);
  end loop;
end
$$;

alter table reports add constraint reports_cause_kr_len check (cause_kr is null or char_length(cause_kr) <= 80);
alter table reports add constraint reports_cause_us_len check (cause_us is null or char_length(cause_us) <= 80);
