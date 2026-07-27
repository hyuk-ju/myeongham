-- 해외(베트남 등) 명함 대응: 보조 휴대폰 + 세금번호
alter table public.cards add column if not exists mobile2 text;
alter table public.cards add column if not exists tax_code text;

-- 작업별(명함 인식 / 질문) AI 제공자·모델 설정
create table if not exists public.ai_settings (
  owner_id         uuid primary key references auth.users(id) on delete cascade,
  extract_provider text check (extract_provider in ('openai-codex', 'anthropic-claude')),
  extract_model    text,
  ask_provider     text check (ask_provider in ('openai-codex', 'anthropic-claude')),
  ask_model        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists ai_settings_set_updated_at on public.ai_settings;
create trigger ai_settings_set_updated_at
  before update on public.ai_settings
  for each row execute function public.set_updated_at();

alter table public.ai_settings enable row level security;

drop policy if exists ai_settings_owner on public.ai_settings;
create policy ai_settings_owner on public.ai_settings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
