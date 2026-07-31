-- 검증 함수가 "깨졌을 때" 와 "입력이 잘못됐을 때" 를 구분해 로그를 남긴다.
--
-- 두 함수의 바깥 `exception when others then return false` 는 원래 아무것도
-- 남기지 않았다. 그래서 2026-07-30 에 is_valid_card_payload 가 42883
-- (pg_catalog.nullif 은 존재하지 않는 함수) 로 터졌을 때, 그 오류가 조용히
-- "유효하지 않은 입력" 으로 둔갑해 명함 저장이 이틀간 완전히 막혔는데도
-- 로그 한 줄 남지 않았다.
--
-- 유효하지 않은 입력은 함수 위쪽에서 전부 명시적으로 return false 한다.
-- 즉 이 바깥 핸들러에 도달했다는 건 **검증기 자체가 깨졌다**는 뜻뿐이다.
-- 이제 그 경우 WARNING 을 남긴다. 동작(fail-closed, false 반환)은 그대로다 —
-- 깨진 검증기가 데이터를 통과시키는 쪽이 훨씬 위험하다.
--
-- 페이로드는 절대 로그에 넣지 않는다 (이름·전화·이메일이 들어 있다).
-- sqlstate 와 sqlerrm 만 남긴다.
--
-- met_at 의 `v_text::date` 중첩 핸들러는 그대로 조용히 둔다. 그쪽은
-- '2026-02-30' 같은 평범한 입력 실수를 걸러내는 정상 제어 흐름이라,
-- 로그를 남기면 진짜 신호가 노이즈에 묻힌다.

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
  -- 여기 도달 = 검증기 고장. 입력 오류는 위에서 전부 걸러진다.
  raise warning '[validator-crash] private.is_valid_card_payload sqlstate=% message=%', sqlstate, sqlerrm;
  return false;
end;
$$;

create or replace function private.is_valid_draft_enrich(p_enrich jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value jsonb;
  v_count integer;
  v_distinct_count integer;
begin
  if p_enrich is null
     or pg_catalog.jsonb_typeof(p_enrich) <> 'object'
     or pg_catalog.octet_length(p_enrich::text) > 16384
     or coalesce(
       (
         select pg_catalog.array_agg(k.key order by k.key)
         from pg_catalog.jsonb_object_keys(p_enrich) as k(key)
       ) = array['capabilities', 'confident', 'industry', 'sources', 'summary']::text[],
       false
     ) = false then
    return false;
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_enrich->'industry') in ('string', 'null'), false) = false
     or coalesce(pg_catalog.jsonb_typeof(p_enrich->'summary') in ('string', 'null'), false) = false
     or pg_catalog.jsonb_typeof(p_enrich->'confident') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(p_enrich->'capabilities') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_enrich->'sources') is distinct from 'array'
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_enrich->>'industry', ''))) > 500
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_enrich->>'summary', ''))) > 500
     or pg_catalog.jsonb_array_length(p_enrich->'capabilities') > 12
     or pg_catalog.jsonb_array_length(p_enrich->'sources') > 10 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_enrich->'capabilities') as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'string'
       or pg_catalog.btrim(item.value #>> '{}') = ''
       or pg_catalog.char_length(pg_catalog.btrim(item.value #>> '{}')) > 80
  ) then
    return false;
  end if;

  select count(*), count(distinct pg_catalog.btrim(item.value #>> '{}'))
  into v_count, v_distinct_count
  from pg_catalog.jsonb_array_elements(p_enrich->'capabilities') as item(value);
  if v_count <> v_distinct_count then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_enrich->'sources') as source(value)
    where pg_catalog.jsonb_typeof(source.value) <> 'object'
       or coalesce(
         (
           select pg_catalog.array_agg(k.key order by k.key)
           from pg_catalog.jsonb_object_keys(source.value) as k(key)
         ) = array['title', 'url']::text[],
         false
       ) = false
       or pg_catalog.jsonb_typeof(source.value->'url') is distinct from 'string'
       or pg_catalog.jsonb_typeof(source.value->'title') is distinct from 'string'
       or pg_catalog.btrim(source.value->>'url') !~ '^https://[^[:space:]]+$'
       or pg_catalog.char_length(pg_catalog.btrim(source.value->>'url')) > 2048
       or pg_catalog.char_length(pg_catalog.btrim(source.value->>'title')) > 200
  ) then
    return false;
  end if;

  select count(*), count(distinct pg_catalog.btrim(source.value->>'url'))
  into v_count, v_distinct_count
  from pg_catalog.jsonb_array_elements(p_enrich->'sources') as source(value);
  return v_count = v_distinct_count;
exception when others then
  -- 여기 도달 = 검증기 고장. 입력 오류는 위에서 전부 걸러진다.
  raise warning '[validator-crash] private.is_valid_draft_enrich sqlstate=% message=%', sqlstate, sqlerrm;
  return false;
end;
$$;
