-- ai_tokens 를 다중 제공자(ChatGPT + Claude) 구조로 확장.
-- 한 사용자당 제공자별 1행, 그중 하나만 is_active.

alter table public.ai_tokens drop constraint ai_tokens_pkey;
alter table public.ai_tokens drop constraint ai_tokens_provider_check;

alter table public.ai_tokens
  add constraint ai_tokens_provider_check
  check (provider in ('openai-codex', 'anthropic-claude'));

alter table public.ai_tokens add primary key (owner_id, provider);

alter table public.ai_tokens add column is_active boolean not null default true;

-- 사용자당 활성 제공자는 하나만
create unique index ai_tokens_one_active_per_owner
  on public.ai_tokens (owner_id)
  where is_active;
