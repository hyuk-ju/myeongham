-- 회사 단위 역량 태그 재사용
--
-- capabilities 는 카드마다 따로 저장된다. 같은 회사 사람을 여러 명 등록하면
-- 웹 검색을 사람 수만큼 돌리게 되고, 그때마다 태그가 조금씩 달라진다.
-- 그러면 "이 회사 뭐 만들어?" 질문에 한 사람만 걸리고 동료는 빠진다.
--
-- 회사명 표기는 흔들리므로((주)선진템 / 주식회사 선진템) normalize_company 로 묶는다.
-- 지난 명함(is_current=false)도 포함한다 — 옛 명함의 역량 정보도 그 회사 정보다.

create or replace function public.company_capabilities(
  p_company text,
  p_exclude uuid default null
)
returns table (tag text, card_count integer, total_cards integer)
language sql
stable
security invoker
set search_path = public
as $$
  with siblings as (
    select c.id, c.capabilities
    from public.cards c
    where c.owner_id = (select auth.jwt()->>'sub')
      -- 회사명이 비었거나 기호뿐이면 normalize 결과가 null 이다. 그때는 아무것도
      -- 묶지 않는다 — null = null 로 전부 매칭되는 사고를 막는다.
      and normalize_company(p_company) is not null
      and normalize_company(c.company) = normalize_company(p_company)
      and (p_exclude is null or c.id <> p_exclude)
  ),
  tags as (
    select s.id, t.tag
    from siblings s, unnest(s.capabilities) as t(tag)
  )
  select
    tags.tag,
    count(distinct tags.id)::integer as card_count,
    (select count(*)::integer from siblings) as total_cards
  from tags
  group by tags.tag
  order by count(distinct tags.id) desc, tags.tag
  limit 40
$$;
