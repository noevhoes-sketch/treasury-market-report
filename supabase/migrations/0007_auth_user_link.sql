-- 이메일+비밀번호 로그인: 가입 신청 때 만든 로그인 계정(auth.users)의 번호를 허용 목록 줄에 연결해 둔다.
-- 오래된 신청을 자동으로 지울 때 그 계정도 함께 지우고, 담당자가 비밀번호를 다시 정해 줄 때 계정을 바로 찾는 데 쓴다.
alter table allowed_users add column if not exists auth_user_id uuid;
create unique index if not exists allowed_users_auth_user_id_key on allowed_users (auth_user_id) where auth_user_id is not null;
