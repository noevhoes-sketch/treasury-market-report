-- 로그인 시도 횟수 제한: 승인되지 않은 시도(실패·등록 신청)를 이메일(해시)·접속 주소(해시)별로 기록해 짧은 시간에 너무 많이 시도하는 것을 막는다.
-- 이메일·주소는 원문이 아니라 해시만 저장한다(개인정보를 남기지 않는다). 오래된 줄은 코드가 지운다.
-- RLS를 켜고 공개 규칙을 만들지 않는다. 서버 전용 키로만 읽고 쓴다.

create table if not exists login_attempts (
  id         bigint generated always as identity primary key,
  bucket     text        not null,                 -- "email:해시" 또는 "ip:해시"
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_bucket_time on login_attempts (bucket, created_at);

alter table login_attempts enable row level security;
