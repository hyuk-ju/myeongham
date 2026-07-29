-- 명함 일괄 등록 대기열
--
-- 지금까지는 촬영 → AI 추출 → 검토 → 저장이 한 흐름으로 묶여 있어서 한 장당
-- 10~30초를 화면 앞에서 기다려야 했다. 사진을 먼저 담아두고 분석은 뒤에서
-- 돌리려면 "아직 검토하지 않은 추출 결과" 를 어딘가 보관해야 한다.
--
-- cards.status 에 'pending'/'extracted' 가 이미 있지만 그 쪽에 담지 않는다.
-- 목록·검색·질문·중복검사 등 읽기 경로 13곳에 status 필터를 넣어야 하고,
-- 한 곳만 빠뜨려도 검토 안 한 OCR 결과가 질문 답변에 섞인다. 이 앱의 존재
-- 이유가 질의라서 가장 비싼 실패다. 테이블을 나누면 기존 읽기 경로를 한 줄도
-- 건드리지 않아 구조적으로 샐 수 없다.
--
-- 추출 결과는 jsonb 한 칸에 통째로 담는다 — cards 의 컬럼 20개를 복제하지
-- 않기 위해서다. 검토를 마치면 기존 POST /api/cards 로 그대로 저장한다.

create table if not exists public.card_drafts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  -- Storage 경로. 행이 생기는 시점에 업로드는 이미 끝나 있다.
  image_path  text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'extracted', 'failed')),
  -- extractCardFromImage 결과 (ExtractedCard). 실패했으면 null.
  extracted   jsonb,
  error       text,
  -- 재시도 횟수 — 반복 실패하는 사진을 사용자가 알아볼 수 있게 한다.
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 대기열은 찍은 순서대로 보여주고, 워커는 pending 을 앞에서부터 집는다.
create index if not exists card_drafts_owner_idx
  on public.card_drafts (owner_id, created_at);

alter table public.card_drafts enable row level security;

-- cards 와 동일한 Clerk 기준 정책 (0008_clerk_auth.sql 패턴)
drop policy if exists card_drafts_owner on public.card_drafts;
create policy card_drafts_owner on public.card_drafts
  for all to authenticated
  using ((select auth.jwt()->>'sub') = owner_id)
  with check ((select auth.jwt()->>'sub') = owner_id);

drop trigger if exists card_drafts_set_updated_at on public.card_drafts;
create trigger card_drafts_set_updated_at
  before update on public.card_drafts
  for each row execute function public.set_updated_at();
