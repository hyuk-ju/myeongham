-- 명함 관리 앱 초기 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create extension if not exists pg_trgm;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  image_path    text not null,
  status        text not null default 'confirmed'
                check (status in ('pending', 'extracted', 'confirmed', 'failed')),

  -- OCR 추출 필드
  name          text,
  name_en       text,
  title         text,
  department    text,
  company       text,
  company_en    text,
  phone         text,
  mobile        text,
  fax           text,
  email         text,
  website       text,
  address       text,
  postal_code   text,
  raw_text      text,

  -- AI 보강 필드 (이 프로젝트의 핵심)
  industry            text,
  capabilities        text[] not null default '{}',
  capabilities_source text check (capabilities_source in ('card', 'web', 'manual')),
  confidence          numeric check (confidence >= 0 and confidence <= 1),

  -- 사용자 메모
  notes         text,
  met_at        date,
  met_context   text,

  -- 3,000장 초과 시 백필하여 하이브리드 검색으로 전환
  embedding     vector(1536),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 인덱스
-- ---------------------------------------------------------------------------
create index if not exists cards_owner_created_idx
  on public.cards (owner_id, created_at desc);

create index if not exists cards_capabilities_idx
  on public.cards using gin (capabilities);

create index if not exists cards_company_trgm_idx
  on public.cards using gin (company gin_trgm_ops);

create index if not exists cards_name_trgm_idx
  on public.cards using gin (name gin_trgm_ops);

-- 한국어는 전용 사전이 없으므로 'simple' 설정을 쓴다.
-- 형태소 분석은 안 되지만 회사명/제품명 같은 명사 토큰 매칭에는 충분하고,
-- 부분 일치는 위의 trgm 인덱스가 담당한다.
create index if not exists cards_fts_idx
  on public.cards using gin (
    to_tsvector(
      'simple',
      coalesce(company, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(industry, '') || ' ' ||
      coalesce(raw_text, '') || ' ' ||
      coalesce(notes, '')
    )
  );

-- 중복 방지: 같은 소유자가 동일 이메일을 두 번 등록하지 못하게 한다.
-- (이메일이 없는 명함은 제외 — 부분 인덱스)
create unique index if not exists cards_owner_email_uniq
  on public.cards (owner_id, lower(email))
  where email is not null and email <> '';

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — 본인 데이터만 접근
-- ---------------------------------------------------------------------------
alter table public.cards enable row level security;

drop policy if exists cards_select_own on public.cards;
create policy cards_select_own on public.cards
  for select using (auth.uid() = owner_id);

drop policy if exists cards_insert_own on public.cards;
create policy cards_insert_own on public.cards
  for insert with check (auth.uid() = owner_id);

drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists cards_delete_own on public.cards;
create policy cards_delete_own on public.cards
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Storage — private 버킷
-- 파일 경로 규칙: {user_id}/{uuid}.jpg  (첫 폴더가 소유자 판별에 쓰인다)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images',
  'card-images',
  false,
  10485760,                                   -- 10MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists card_images_select_own on storage.objects;
create policy card_images_select_own on storage.objects
  for select using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_insert_own on storage.objects;
create policy card_images_insert_own on storage.objects
  for insert with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_update_own on storage.objects;
create policy card_images_update_own on storage.objects
  for update using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_delete_own on storage.objects;
create policy card_images_delete_own on storage.objects
  for delete using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 태그 자동완성용 헬퍼 — 내가 이미 쓴 capabilities 태그를 빈도순으로
-- ---------------------------------------------------------------------------
create or replace function public.my_capability_tags()
returns table (tag text, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select c.tag, count(*) as uses
  from public.cards, unnest(cards.capabilities) as c(tag)
  where cards.owner_id = auth.uid()
  group by c.tag
  order by uses desc, c.tag asc
$$;
