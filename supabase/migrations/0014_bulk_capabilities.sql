-- 일괄 보강 — 역량 태그 없는 명함을 회사 단위로 채운다
--
-- 등록 당시 건너뛰었거나 웹 검색이 실패한 명함은 태그가 빈 채로 남는다.
-- 태그가 없으면 질문에 안 걸리므로 이 앱에서는 사실상 없는 명함이 된다.
-- 홈의 '역량 태그 없음 N' 에서 바로 정리할 수 있게 두 함수를 둔다.

-- 1) 태그가 빈 명함이 있는 회사 목록 (많이 밀린 회사부터)
create or replace function public.companies_needing_capabilities()
returns table (company text, missing integer, total integer)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select c.company, c.capabilities
    from public.cards c
    where c.owner_id = (select auth.jwt()->>'sub')
      and c.is_current
      and normalize_company(c.company) is not null
  ),
  grouped as (
    select
      normalize_company(m.company) as key,
      -- 표기가 여러 개면 가장 흔한 것을 대표로 쓴다.
      mode() within group (order by m.company) as company,
      count(*) filter (where cardinality(m.capabilities) = 0)::integer as missing,
      count(*)::integer as total
    from mine m
    group by normalize_company(m.company)
  )
  select g.company, g.missing, g.total
  from grouped g
  where g.missing > 0
  order by g.missing desc, g.company
$$;

-- 2) 고른 태그를 그 회사 명함 전체에 적용
--
-- 기존 태그는 지우지 않고 합친다 — 사용자가 직접 넣은 태그를 웹 검색 결과가
-- 덮어쓰면 안 된다. industry 는 비어 있을 때만 채운다.
create or replace function public.apply_company_capabilities(
  p_company text,
  p_capabilities text[],
  p_industry text default null
)
returns integer
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update public.cards c
    set capabilities = (
          select array(select distinct unnest(c.capabilities || p_capabilities))
        ),
        capabilities_source = coalesce(c.capabilities_source, 'web'),
        industry = coalesce(c.industry, p_industry)
    where c.owner_id = (select auth.jwt()->>'sub')
      and c.is_current
      and normalize_company(p_company) is not null
      and normalize_company(c.company) = normalize_company(p_company)
    returning 1
  )
  select count(*)::integer from updated;
$$;
