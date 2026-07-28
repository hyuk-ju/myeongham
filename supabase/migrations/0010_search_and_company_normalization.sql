-- 검색 품질 개선 + 회사명 정규화
--
-- 문제 1: capabilities 는 배열이라 PostgREST 로는 부분 일치 검색이 안 된다.
--         태그가 'Hot press' 인데 '핫프레스' 로 물으면 못 찾았다.
-- 문제 2: 법인격 표기가 달라 같은 회사가 중복 등록됐다
--         ((주)선진템 vs 주식회사 선진템, Co.,Ltd. vs Co., Ltd.)

create or replace function public.normalize_company(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(v, '')), '(주식회사|유한회사|㈜|\(주\)|\(유\))', ' ', 'g'),
        -- 앞뒤가 알파벳이 아닐 때만 지운다 (Incheon 의 Inc 를 지우지 않기 위해)
        '(^|[^a-z])(co\.?\s*,?\s*ltd\.?|company\s+limited|corporation|corp\.|inc\.?|jsc|llc)($|[^a-z])',
        '\1 \3', 'g'
      ),
      '[^a-z0-9가-힣]', '', 'g'
    ), '');
$$;

create index if not exists cards_owner_company_norm_idx
  on public.cards (owner_id, public.normalize_company(company));

-- 카드 검색 — 여러 후보어 중 하나라도 걸리면 반환하고, 많이 걸린 순으로 정렬.
-- capabilities 배열을 텍스트로 펼쳐 함께 훑기 때문에 'Hot press' 태그가
-- 'hot press' 후보어로 잡힌다. 한/영 확장은 호출부(AI)가 만들어 넣는다.
create or replace function public.search_cards(
  p_terms text[] default '{}',
  p_limit int default 60
)
returns setof public.cards
language sql
stable
security invoker
set search_path = public
as $$
  with haystack as (
    select
      c,
      lower(concat_ws(' ',
        c.company, c.company_en, c.name, c.name_en, c.title, c.department,
        c.industry, array_to_string(c.capabilities, ' '),
        c.notes, c.met_context, c.address, c.raw_text
      )) as blob
    from public.cards c
    where c.owner_id = (select auth.jwt()->>'sub')
      and c.is_current
  )
  select (h.c).*
  from haystack h
  cross join lateral (
    select count(*) as hits
    from unnest(p_terms) as t
    where t <> '' and h.blob like '%' || lower(t) || '%'
  ) s
  where cardinality(p_terms) = 0 or s.hits > 0
  order by s.hits desc, (h.c).created_at desc
  limit p_limit
$$;

-- 중복 후보 조회 — 회사명 비교를 정규화 기준으로 바꾼다
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
      normalize_company(p_company)       as company,
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
       and normalize_company(c.company) = i.company and lower(c.name) = i.name then 'same_person'
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
      or (i.company is not null and normalize_company(c.company) = i.company)
    )
  order by
    case when c.is_current then 0 else 1 end,
    c.created_at desc
  limit 20
$$;
