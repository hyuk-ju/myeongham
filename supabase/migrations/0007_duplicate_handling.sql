-- 중복 명함 처리 재설계
--
-- 기존: (owner_id, email) 유니크 → 같은 사람이 명함을 바꿔 준 경우 저장 자체가 막혔다.
-- 변경: 하드 차단을 없애고 "같은 사람의 이전 명함" 을 supersedes_id 로 연결한다.
--   · 같은 회사 다른 사람  → 그냥 별개 행 (제약 없음)
--   · 같은 사람 새 명함    → 새 행 + supersedes_id, 이전 행은 is_current=false
--   · 완전 동일 재촬영     → 저장 전 UI 에서 경고 (DB 제약 아님)

drop index if exists cards_owner_email_uniq;

alter table public.cards
  add column if not exists supersedes_id uuid references public.cards(id) on delete set null,
  add column if not exists is_current boolean not null default true;

create index if not exists cards_owner_current_idx
  on public.cards (owner_id, is_current, created_at desc);

create index if not exists cards_owner_company_idx
  on public.cards (owner_id, lower(company));

-- 중복 후보 조회 — 저장 직전에 부른다.
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
  where c.owner_id = auth.uid()
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
