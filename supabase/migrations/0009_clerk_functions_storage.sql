-- 헬퍼 함수와 Storage 정책도 Clerk 토큰 기준으로 전환

create or replace function public.my_capability_tags()
returns table (tag text, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select c.tag, count(*) as uses
  from public.cards, unnest(cards.capabilities) as c(tag)
  where cards.owner_id = (select auth.jwt()->>'sub')
  group by c.tag
  order by uses desc, c.tag asc
$$;

create or replace function public.find_duplicate_candidates(
  p_email   text default null,
  p_email2  text default null,
  p_mobile  text default null,
  p_mobile2 text default null,
  p_company text default null,
  p_name    text default null
)
returns table (
  id            uuid,
  company       text,
  name          text,
  title         text,
  department    text,
  mobile        text,
  email         text,
  is_current    boolean,
  created_at    timestamptz,
  match_kind    text
)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select
      nullif(lower(trim(p_email)), '')   as email,
      nullif(lower(trim(p_email2)), '')  as email2,
      nullif(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), '')  as mobile,
      nullif(regexp_replace(coalesce(p_mobile2, ''), '\D', '', 'g'), '') as mobile2,
      nullif(lower(trim(p_company)), '') as company,
      nullif(lower(trim(p_name)), '')    as name
  )
  select
    c.id, c.company, c.name, c.title, c.department, c.mobile, c.email,
    c.is_current, c.created_at,
    case
      when i.email is not null and lower(c.email) in (i.email, i.email2) then 'same_person'
      when i.email2 is not null and lower(c.email2) in (i.email, i.email2) then 'same_person'
      when i.mobile is not null
       and regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g') in (i.mobile, i.mobile2) then 'same_person'
      when i.mobile2 is not null
       and regexp_replace(coalesce(c.mobile2, ''), '\D', '', 'g') in (i.mobile, i.mobile2) then 'same_person'
      when i.company is not null and i.name is not null
       and lower(c.company) = i.company and lower(c.name) = i.name then 'same_person'
      else 'same_company'
    end as match_kind
  from public.cards c, input i
  where c.owner_id = (select auth.jwt()->>'sub')
    and (
      (i.email is not null and (lower(c.email) = i.email or lower(c.email2) = i.email))
      or (i.email2 is not null and (lower(c.email) = i.email2 or lower(c.email2) = i.email2))
      or (i.mobile is not null and (
            regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g') = i.mobile
         or regexp_replace(coalesce(c.mobile2, ''), '\D', '', 'g') = i.mobile))
      or (i.mobile2 is not null and (
            regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g') = i.mobile2
         or regexp_replace(coalesce(c.mobile2, ''), '\D', '', 'g') = i.mobile2))
      or (i.company is not null and lower(c.company) = i.company)
    )
  order by
    case when c.is_current then 0 else 1 end,
    c.created_at desc
  limit 20
$$;

-- Storage: 새 업로드는 {clerk_user_id}/ 폴더에 넣는다.
-- 읽기/삭제는 폴더가 달라도(예전 Supabase uuid 폴더) 내 명함이면 허용한다 —
-- 그래야 기존 이미지를 옮기지 않고도 계속 볼 수 있다.
drop policy if exists card_images_select_own on storage.objects;
create policy card_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'card-images'
    and (
      (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
      or exists (
        select 1 from public.cards c
        where c.image_path = storage.objects.name
          and c.owner_id = (select auth.jwt()->>'sub')
      )
    )
  );

drop policy if exists card_images_insert_own on storage.objects;
create policy card_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists card_images_update_own on storage.objects;
create policy card_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists card_images_delete_own on storage.objects;
create policy card_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (
      (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
      or exists (
        select 1 from public.cards c
        where c.image_path = storage.objects.name
          and c.owner_id = (select auth.jwt()->>'sub')
      )
    )
  );
