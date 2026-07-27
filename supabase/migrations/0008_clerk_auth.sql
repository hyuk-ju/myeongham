-- Supabase Auth → Clerk 전환
--
-- Clerk 사용자 ID 는 'user_xxx' 형태의 문자열이라 uuid 컬럼에 담을 수 없다.
-- owner_id 를 text 로 바꾸고 RLS 를 auth.jwt()->>'sub' 기준으로 다시 쓴다.
-- 기존 행의 owner_id 는 예전 Supabase uuid 문자열로 남으며,
-- 최초 Clerk 로그인 후 새 ID 로 이관한다.

-- 1) 컬럼을 참조하는 정책을 먼저 제거 (타입 변경 전제조건)
drop policy if exists cards_select_own   on public.cards;
drop policy if exists cards_insert_own   on public.cards;
drop policy if exists cards_update_own   on public.cards;
drop policy if exists cards_delete_own   on public.cards;
drop policy if exists ai_tokens_owner    on public.ai_tokens;
drop policy if exists ai_settings_owner  on public.ai_settings;

-- 2) FK 제거 후 타입 변경
alter table public.cards        drop constraint if exists cards_owner_id_fkey;
alter table public.ai_tokens    drop constraint if exists ai_tokens_owner_id_fkey;
alter table public.ai_settings  drop constraint if exists ai_settings_owner_id_fkey;

alter table public.cards        alter column owner_id type text using owner_id::text;
alter table public.ai_tokens    alter column owner_id type text using owner_id::text;
alter table public.ai_settings  alter column owner_id type text using owner_id::text;

-- 3) RLS 정책 재작성 (Clerk 세션 토큰의 sub 클레임 기준)
create policy cards_select_own on public.cards
  for select to authenticated
  using ((select auth.jwt()->>'sub') = owner_id);

create policy cards_insert_own on public.cards
  for insert to authenticated
  with check ((select auth.jwt()->>'sub') = owner_id);

create policy cards_update_own on public.cards
  for update to authenticated
  using ((select auth.jwt()->>'sub') = owner_id)
  with check ((select auth.jwt()->>'sub') = owner_id);

create policy cards_delete_own on public.cards
  for delete to authenticated
  using ((select auth.jwt()->>'sub') = owner_id);

create policy ai_tokens_owner on public.ai_tokens
  for all to authenticated
  using ((select auth.jwt()->>'sub') = owner_id)
  with check ((select auth.jwt()->>'sub') = owner_id);

create policy ai_settings_owner on public.ai_settings
  for all to authenticated
  using ((select auth.jwt()->>'sub') = owner_id)
  with check ((select auth.jwt()->>'sub') = owner_id);
