-- 명함 저장이 완전히 막혀 있던 문제 수정 + 역량 태그 상한 12 → 24
--
-- 1) private.is_valid_card_payload 가 모든 입력에 대해 false 를 돌려주고 있었다.
--    마지막 return 문의 `pg_catalog.nullif(...)` 때문이다. NULLIF 는 SQL 구문이지
--    pg_catalog 의 함수가 아니라서 42883 으로 터지는데, 함수 끝의
--    `exception when others then return false` 가 그 오류를 삼켜 "유효하지 않은
--    입력" 으로 둔갑시켰다. 이 함수를 게이트로 쓰는 public.save_card 와
--    public.finalize_card_draft 가 항상 invalid_input 을 반환했고, 그래서
--    2026-07-30 09:12(UTC) 이 마이그레이션이 적용된 뒤로 명함이 단 한 장도
--    저장되지 않았다. 두 함수의 INSERT 값 목록에도 같은 표현이 있어 함께 고친다.
--    (그쪽은 예외 핸들러가 없어 게이트만 고치면 곧바로 500 으로 터진다)
--
-- 2) 역량 태그 상한을 12 → 24 로 올린다. 제조·유통 명함은 취급 품목이 십수 개씩
--    적혀 있는 게 정상이라 12개로는 실제 정보가 잘려 나갔다. 이 값은
--    lib/http-contracts.ts 의 CARD_LIMITS.tags 와 반드시 같아야 한다 — 두 쪽이
--    갈라지면 저장은 되는데 다시 읽히지 않는 행이 생긴다.
--
--    웹 보강 제안(private.is_valid_draft_enrich)은 12 그대로 둔다. 사람이 검토해
--    승인하는 후보라 짧은 편이 낫고, lib/ai/enrich.ts 는 8개까지만 만든다.
--
-- 완화·복구 방향이라 기존 데이터와 기존 배포 모두에 호환된다.

create or replace function private.is_valid_card_payload(p_card jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_text text;
  v_met_at date;
  v_capability_count integer;
  v_capability_distinct_count integer;
begin
  if p_card is null
     or pg_catalog.jsonb_typeof(p_card) <> 'object'
     or pg_catalog.octet_length(p_card::text) > 32768 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_card) as k(key)
    where k.key not in (
      'name', 'name_en', 'title', 'department', 'company', 'company_en',
      'phone', 'mobile', 'mobile2', 'fax', 'email', 'email2', 'website',
      'address', 'postal_code', 'tax_code', 'raw_text', 'industry',
      'capabilities', 'capabilities_source', 'confidence', 'notes', 'met_at',
      'met_context'
    )
  ) then
    return false;
  end if;

  for v_key, v_value in
    select e.key, e.value from pg_catalog.jsonb_each(p_card) as e
  loop
    if v_key = 'capabilities' then
      if pg_catalog.jsonb_typeof(v_value) = 'null' then
        continue;
      end if;
      if pg_catalog.jsonb_typeof(v_value) <> 'array'
         or pg_catalog.jsonb_array_length(v_value) > 24
         or exists (
           select 1
           from pg_catalog.jsonb_array_elements(v_value) as item(value)
           where pg_catalog.jsonb_typeof(item.value) <> 'string'
              or pg_catalog.btrim(item.value #>> '{}') = ''
              or pg_catalog.char_length(pg_catalog.btrim(item.value #>> '{}')) > 80
         ) then
        return false;
      end if;
      select count(*), count(distinct pg_catalog.btrim(item.value #>> '{}'))
      into v_capability_count, v_capability_distinct_count
      from pg_catalog.jsonb_array_elements(v_value) as item(value);
      if v_capability_count <> v_capability_distinct_count then
        return false;
      end if;
      continue;
    end if;

    if v_key = 'confidence' then
      if pg_catalog.jsonb_typeof(v_value) <> 'null'
         and (
           pg_catalog.jsonb_typeof(v_value) <> 'number'
           or (v_value #>> '{}')::numeric < 0
           or (v_value #>> '{}')::numeric > 1
         ) then
        return false;
      end if;
      continue;
    end if;

    if pg_catalog.jsonb_typeof(v_value) = 'null' then
      continue;
    end if;
    if pg_catalog.jsonb_typeof(v_value) <> 'string' then
      return false;
    end if;

    v_text := pg_catalog.btrim(v_value #>> '{}');
    if v_key in (
      'name', 'name_en', 'title', 'department', 'company', 'company_en',
      'email', 'email2', 'website', 'address', 'postal_code', 'tax_code',
      'industry', 'met_context'
    ) and pg_catalog.char_length(v_text) > 500 then
      return false;
    elsif v_key in ('phone', 'mobile', 'mobile2', 'fax')
          and pg_catalog.char_length(v_text) > 64 then
      return false;
    elsif v_key = 'raw_text' and pg_catalog.char_length(v_text) > 10000 then
      return false;
    elsif v_key = 'notes' and pg_catalog.char_length(v_text) > 5000 then
      return false;
    elsif v_key = 'capabilities_source'
          and v_text not in ('card', 'web', 'manual') then
      return false;
    elsif v_key = 'met_at' then
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        v_met_at := v_text::date;
      exception when others then
        return false;
      end;
      if pg_catalog.to_char(v_met_at, 'YYYY-MM-DD') <> v_text then
        return false;
      end if;
    end if;
  end loop;

  return coalesce(nullif(pg_catalog.btrim(p_card->>'name'), ''), '') <> ''
      or coalesce(nullif(pg_catalog.btrim(p_card->>'company'), ''), '') <> ''
      or coalesce(nullif(pg_catalog.btrim(p_card->>'email'), ''), '') <> ''
      or coalesce(nullif(pg_catalog.btrim(p_card->>'mobile'), ''), '') <> '';
exception when others then
  return false;
end;
$$;

create or replace function public.finalize_card_draft(
  p_draft_id uuid,
  p_card jsonb,
  p_supersedes_id uuid default null
)
returns table (code text, card_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_draft public.card_drafts%rowtype;
  v_existing_id uuid;
  v_card_id uuid;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, null::uuid, false;
    return;
  end if;

  select c.id into v_existing_id
  from public.cards as c
  where c.owner_id = v_owner_id and c.source_draft_id = p_draft_id;
  if found then
    return query select 'finalized'::text, v_existing_id, false;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));
  select d.* into v_draft
  from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id
  for update;

  select c.id into v_existing_id
  from public.cards as c
  where c.owner_id = v_owner_id and c.source_draft_id = p_draft_id;
  if found then
    return query select 'finalized'::text, v_existing_id, false;
    return;
  end if;
  if v_draft.id is null then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;
  if v_draft.status = 'processing' then
    return query select 'busy'::text, null::uuid, false;
    return;
  end if;
  if v_draft.status not in ('extracted', 'failed') then
    return query select 'invalid_state'::text, null::uuid, false;
    return;
  end if;
  if not private.is_valid_card_payload(p_card) then
    return query select 'invalid_input'::text, null::uuid, false;
    return;
  end if;
  if p_supersedes_id is not null then
    perform 1
    from public.cards as c
    where c.id = p_supersedes_id and c.owner_id = v_owner_id
    for update;
    if not found then
      return query select 'not_found'::text, null::uuid, false;
      return;
    end if;
  end if;

  insert into public.cards (
    owner_id, image_path, status, name, name_en, title, department, company,
    company_en, phone, mobile, mobile2, fax, email, email2, website, address,
    postal_code, tax_code, raw_text, industry, capabilities,
    capabilities_source, confidence, notes, met_at, met_context,
    supersedes_id, is_current, source_draft_id
  )
  values (
    v_owner_id, v_draft.image_path, 'confirmed',
    nullif(pg_catalog.btrim(p_card->>'name'), ''),
    nullif(pg_catalog.btrim(p_card->>'name_en'), ''),
    nullif(pg_catalog.btrim(p_card->>'title'), ''),
    nullif(pg_catalog.btrim(p_card->>'department'), ''),
    nullif(pg_catalog.btrim(p_card->>'company'), ''),
    nullif(pg_catalog.btrim(p_card->>'company_en'), ''),
    nullif(pg_catalog.btrim(p_card->>'phone'), ''),
    nullif(pg_catalog.btrim(p_card->>'mobile'), ''),
    nullif(pg_catalog.btrim(p_card->>'mobile2'), ''),
    nullif(pg_catalog.btrim(p_card->>'fax'), ''),
    nullif(pg_catalog.btrim(p_card->>'email'), ''),
    nullif(pg_catalog.btrim(p_card->>'email2'), ''),
    nullif(pg_catalog.btrim(p_card->>'website'), ''),
    nullif(pg_catalog.btrim(p_card->>'address'), ''),
    nullif(pg_catalog.btrim(p_card->>'postal_code'), ''),
    nullif(pg_catalog.btrim(p_card->>'tax_code'), ''),
    nullif(pg_catalog.btrim(p_card->>'raw_text'), ''),
    nullif(pg_catalog.btrim(p_card->>'industry'), ''),
    coalesce((
      select pg_catalog.array_agg(pg_catalog.btrim(item.value #>> '{}') order by item.ordinality)
      from pg_catalog.jsonb_array_elements(coalesce(p_card->'capabilities', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ), '{}'::text[]),
    nullif(pg_catalog.btrim(p_card->>'capabilities_source'), ''),
    (p_card->>'confidence')::numeric,
    nullif(pg_catalog.btrim(p_card->>'notes'), ''),
    (p_card->>'met_at')::date,
    nullif(pg_catalog.btrim(p_card->>'met_context'), ''),
    p_supersedes_id, true, p_draft_id
  )
  returning id into v_card_id;

  if p_supersedes_id is not null then
    update public.cards as c
    set is_current = false
    where c.id = p_supersedes_id and c.owner_id = v_owner_id;
  end if;
  delete from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id;

  return query select 'finalized'::text, v_card_id, true;
end;
$$;

create or replace function public.save_card(
  p_card jsonb,
  p_image_path text,
  p_supersedes_id uuid default null
)
returns table (code text, card_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_card_id uuid;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, null::uuid;
    return;
  end if;
  if not private.is_valid_card_payload(p_card)
     or not private.is_owned_card_image_path(v_owner_id, p_image_path) then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));
  if p_supersedes_id is not null then
    perform 1
    from public.cards as c
    where c.id = p_supersedes_id and c.owner_id = v_owner_id
    for update;
    if not found then
      return query select 'not_found'::text, null::uuid;
      return;
    end if;
  end if;

  insert into public.cards (
    owner_id, image_path, status, name, name_en, title, department, company,
    company_en, phone, mobile, mobile2, fax, email, email2, website, address,
    postal_code, tax_code, raw_text, industry, capabilities,
    capabilities_source, confidence, notes, met_at, met_context,
    supersedes_id, is_current
  )
  values (
    v_owner_id, p_image_path, 'confirmed',
    nullif(pg_catalog.btrim(p_card->>'name'), ''),
    nullif(pg_catalog.btrim(p_card->>'name_en'), ''),
    nullif(pg_catalog.btrim(p_card->>'title'), ''),
    nullif(pg_catalog.btrim(p_card->>'department'), ''),
    nullif(pg_catalog.btrim(p_card->>'company'), ''),
    nullif(pg_catalog.btrim(p_card->>'company_en'), ''),
    nullif(pg_catalog.btrim(p_card->>'phone'), ''),
    nullif(pg_catalog.btrim(p_card->>'mobile'), ''),
    nullif(pg_catalog.btrim(p_card->>'mobile2'), ''),
    nullif(pg_catalog.btrim(p_card->>'fax'), ''),
    nullif(pg_catalog.btrim(p_card->>'email'), ''),
    nullif(pg_catalog.btrim(p_card->>'email2'), ''),
    nullif(pg_catalog.btrim(p_card->>'website'), ''),
    nullif(pg_catalog.btrim(p_card->>'address'), ''),
    nullif(pg_catalog.btrim(p_card->>'postal_code'), ''),
    nullif(pg_catalog.btrim(p_card->>'tax_code'), ''),
    nullif(pg_catalog.btrim(p_card->>'raw_text'), ''),
    nullif(pg_catalog.btrim(p_card->>'industry'), ''),
    coalesce((
      select pg_catalog.array_agg(pg_catalog.btrim(item.value #>> '{}') order by item.ordinality)
      from pg_catalog.jsonb_array_elements(coalesce(p_card->'capabilities', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ), '{}'::text[]),
    nullif(pg_catalog.btrim(p_card->>'capabilities_source'), ''),
    (p_card->>'confidence')::numeric,
    nullif(pg_catalog.btrim(p_card->>'notes'), ''),
    (p_card->>'met_at')::date,
    nullif(pg_catalog.btrim(p_card->>'met_context'), ''),
    p_supersedes_id, true
  )
  returning id into v_card_id;

  if p_supersedes_id is not null then
    update public.cards as c
    set is_current = false
    where c.id = p_supersedes_id and c.owner_id = v_owner_id;
  end if;
  return query select 'saved'::text, v_card_id;
end;
$$;
