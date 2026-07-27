-- 해외 명함은 업무용/세금계산서용 이메일이 따로 있는 경우가 흔하다
alter table public.cards add column if not exists email2 text;
