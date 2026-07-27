-- ChatGPT 구독 OAuth 토큰 저장소
--
-- 서버리스(Vercel)에서는 인스턴스가 여러 개라 refresh token 동시 갱신이
-- 발생할 수 있다. 일부 제공자는 사용된 refresh token을 즉시 무효화하므로
-- (rotation), 갱신을 반드시 직렬화해야 한다.
-- 여기서는 refresh_started_at 컬럼을 이용한 CAS(compare-and-swap) 방식을 쓴다:
--   1) UPDATE ... WHERE refresh_started_at IS NULL OR 오래됨 → 성공한 쪽만 갱신 수행
--   2) 실패한 쪽은 잠시 대기 후 재조회 (갱신된 access token을 그대로 사용)

create table if not exists public.ai_tokens (
  owner_id            uuid primary key references auth.users(id) on delete cascade,
  provider            text not null default 'openai-codex'
                      check (provider in ('openai-codex')),
  access_token        text not null,
  refresh_token       text not null,
  expires_at          timestamptz not null,
  chatgpt_account_id  text,
  refresh_started_at  timestamptz,          -- CAS 락. 갱신 중인 인스턴스가 점유
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists ai_tokens_set_updated_at on public.ai_tokens;
create trigger ai_tokens_set_updated_at
  before update on public.ai_tokens
  for each row execute function public.set_updated_at();

alter table public.ai_tokens enable row level security;

drop policy if exists ai_tokens_owner on public.ai_tokens;
create policy ai_tokens_owner on public.ai_tokens
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
