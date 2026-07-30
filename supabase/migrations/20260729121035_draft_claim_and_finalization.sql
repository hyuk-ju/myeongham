-- Database-owned draft queue transitions and atomic card finalization.
--
-- External AI/network work deliberately happens outside these transactions.
-- A short owner advisory lock serializes only the state mutation at either side
-- of that work, while a rotating token fences late workers.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.card_drafts
  drop constraint if exists card_drafts_status_check;

alter table public.card_drafts
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token uuid,
  add constraint card_drafts_status_check
    check (status in ('pending', 'processing', 'extracted', 'failed')),
  add constraint card_drafts_processing_fields_check
    check (
      (status = 'processing' and processing_started_at is not null and processing_token is not null)
      or
      (status <> 'processing' and processing_started_at is null and processing_token is null)
    );

create unique index if not exists card_drafts_one_processing_per_owner
  on public.card_drafts (owner_id)
  where status = 'processing';

alter table public.cards
  add column if not exists source_draft_id uuid;

create unique index if not exists cards_source_draft_id_uniq
  on public.cards (source_draft_id)
  where source_draft_id is not null;

alter table public.ai_settings
  drop constraint if exists ai_settings_enrich_provider_check;

alter table public.ai_settings
  add constraint ai_settings_enrich_provider_check
  check (enrich_provider in ('openai-codex', 'openai-api', 'anthropic-claude'));

create or replace function private.is_owned_card_image_path(
  p_owner_id text,
  p_image_path text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_owner_id is not null
    and p_owner_id <> ''
    and p_image_path is not null
    and p_image_path = pg_catalog.btrim(p_image_path)
    and p_image_path <> ''
    and p_image_path !~ '^/'
    and p_image_path !~ '//'
    and p_image_path !~ E'\\\\'
    and p_image_path !~* '%(?:2e|2f|5c)'
    and p_image_path !~ '[?#]'
    and pg_catalog.array_length(pg_catalog.string_to_array(p_image_path, '/'), 1) = 2
    and pg_catalog.split_part(p_image_path, '/', 1) = p_owner_id
    and pg_catalog.split_part(p_image_path, '/', 2) not in ('', '.', '..')
$$;

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
         or pg_catalog.jsonb_array_length(v_value) > 12
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

  return coalesce(pg_catalog.nullif(pg_catalog.btrim(p_card->>'name'), ''), '') <> ''
      or coalesce(pg_catalog.nullif(pg_catalog.btrim(p_card->>'company'), ''), '') <> ''
      or coalesce(pg_catalog.nullif(pg_catalog.btrim(p_card->>'email'), ''), '') <> ''
      or coalesce(pg_catalog.nullif(pg_catalog.btrim(p_card->>'mobile'), ''), '') <> '';
exception when others then
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
  return false;
end;
$$;

revoke execute on function private.is_owned_card_image_path(text, text)
  from public, anon, authenticated;
revoke execute on function private.is_valid_card_payload(jsonb)
  from public, anon, authenticated;
revoke execute on function private.is_valid_draft_enrich(jsonb)
  from public, anon, authenticated;

create or replace function public.claim_card_draft(p_draft_id uuid)
returns table (
  code text,
  draft_id uuid,
  processing_token uuid,
  status text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_target public.card_drafts%rowtype;
  v_token uuid;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, null::uuid, null::uuid, null::text, null::integer;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));

  select d.* into v_target
  from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id
  for update;

  if not found then
    return query select 'not_found'::text, p_draft_id, null::uuid, null::text, null::integer;
    return;
  end if;
  if v_target.status = 'extracted' then
    return query select 'already_extracted'::text, v_target.id, null::uuid, 'extracted'::text, v_target.attempts;
    return;
  end if;

  update public.card_drafts as d
  set status = 'pending',
      error = 'claim_expired',
      processing_started_at = null,
      processing_token = null
  where d.owner_id = v_owner_id
    and d.status = 'processing'
    and d.processing_started_at <= pg_catalog.clock_timestamp() - interval '180 seconds';

  select d.* into v_target
  from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id
  for update;

  if exists (
    select 1
    from public.card_drafts as d
    where d.owner_id = v_owner_id
      and d.status = 'processing'
      and d.processing_started_at > pg_catalog.clock_timestamp() - interval '180 seconds'
  ) then
    return query select 'busy'::text, v_target.id, null::uuid, 'processing'::text, v_target.attempts;
    return;
  end if;

  if v_target.status not in ('pending', 'failed') then
    return query select 'busy'::text, v_target.id, null::uuid, v_target.status, v_target.attempts;
    return;
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update public.card_drafts as d
  set status = 'processing',
      error = null,
      attempts = d.attempts + 1,
      processing_started_at = pg_catalog.clock_timestamp(),
      processing_token = v_token
  where d.id = v_target.id;

  return query
  select 'claimed'::text, v_target.id, v_token, 'processing'::text, v_target.attempts + 1;
end;
$$;

create or replace function public.complete_card_draft_extraction(
  p_draft_id uuid,
  p_processing_token uuid,
  p_extracted jsonb
)
returns table (code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_target public.card_drafts%rowtype;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, null::text;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));
  select d.* into v_target
  from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id
  for update;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  if v_target.status <> 'processing'
     or p_processing_token is null
     or v_target.processing_token <> p_processing_token then
    return query select 'stale_token'::text, v_target.status;
    return;
  end if;
  if p_extracted is null
     or pg_catalog.jsonb_typeof(p_extracted) <> 'object'
     or pg_catalog.octet_length(p_extracted::text) > 65536 then
    return query select 'invalid_input'::text, 'processing'::text;
    return;
  end if;
  update public.card_drafts as d
  set status = 'extracted',
      extracted = p_extracted,
      error = null,
      processing_started_at = null,
      processing_token = null
  where d.id = p_draft_id;
  return query select 'completed'::text, 'extracted'::text;
end;
$$;

create or replace function public.fail_card_draft_extraction(
  p_draft_id uuid,
  p_processing_token uuid,
  p_error text
)
returns table (code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_target public.card_drafts%rowtype;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, null::text;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));
  select d.* into v_target
  from public.card_drafts as d
  where d.id = p_draft_id and d.owner_id = v_owner_id
  for update;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  if v_target.status <> 'processing'
     or p_processing_token is null
     or v_target.processing_token <> p_processing_token then
    return query select 'stale_token'::text, v_target.status;
    return;
  end if;
  if p_error is null
     or pg_catalog.btrim(p_error) = ''
     or pg_catalog.char_length(p_error) > 1000 then
    return query select 'invalid_input'::text, 'processing'::text;
    return;
  end if;
  update public.card_drafts as d
  set status = 'failed',
      extracted = null,
      error = p_error,
      processing_started_at = null,
      processing_token = null
  where d.id = p_draft_id;
  return query select 'failed'::text, 'failed'::text;
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
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'name'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'name_en'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'title'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'department'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'company'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'company_en'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'phone'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'mobile'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'mobile2'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'fax'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'email'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'email2'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'website'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'address'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'postal_code'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'tax_code'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'raw_text'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'industry'), ''),
    coalesce((
      select pg_catalog.array_agg(pg_catalog.btrim(item.value #>> '{}') order by item.ordinality)
      from pg_catalog.jsonb_array_elements(coalesce(p_card->'capabilities', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ), '{}'::text[]),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'capabilities_source'), ''),
    (p_card->>'confidence')::numeric,
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'notes'), ''),
    (p_card->>'met_at')::date,
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'met_context'), ''),
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
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'name'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'name_en'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'title'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'department'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'company'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'company_en'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'phone'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'mobile'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'mobile2'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'fax'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'email'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'email2'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'website'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'address'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'postal_code'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'tax_code'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'raw_text'), ''),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'industry'), ''),
    coalesce((
      select pg_catalog.array_agg(pg_catalog.btrim(item.value #>> '{}') order by item.ordinality)
      from pg_catalog.jsonb_array_elements(coalesce(p_card->'capabilities', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ), '{}'::text[]),
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'capabilities_source'), ''),
    (p_card->>'confidence')::numeric,
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'notes'), ''),
    (p_card->>'met_at')::date,
    pg_catalog.nullif(pg_catalog.btrim(p_card->>'met_context'), ''),
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

drop function if exists public.apply_draft_enrich(text, jsonb);

create or replace function public.apply_draft_enrich(
  p_company text,
  p_enrich jsonb
)
returns table (code text, updated integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id text := (select auth.jwt()->>'sub');
  v_updated integer;
begin
  if v_owner_id is null or v_owner_id = '' then
    return query select 'unauthorized'::text, 0;
    return;
  end if;
  if p_company is null
     or pg_catalog.btrim(p_company) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_company)) > 500
     or public.normalize_company(pg_catalog.btrim(p_company)) is null
     or not private.is_valid_draft_enrich(p_enrich) then
    return query select 'invalid_input'::text, 0;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id, 0));
  update public.card_drafts as d
  set enrich = p_enrich
  where d.owner_id = v_owner_id
    and d.status = 'extracted'
    and public.normalize_company(d.extracted->>'company')
        = public.normalize_company(pg_catalog.btrim(p_company));
  get diagnostics v_updated = row_count;
  return query select 'applied'::text, v_updated;
end;
$$;

-- Ownership is row-scoped, while image paths are immutable after creation.
-- This keeps legacy card images editable without allowing a new forged path.
drop policy if exists cards_insert_own on public.cards;
drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards
  for update to authenticated
  using ((select auth.jwt()->>'sub') = owner_id)
  with check ((select auth.jwt()->>'sub') = owner_id);

drop policy if exists card_drafts_owner on public.card_drafts;
drop policy if exists card_drafts_select_own on public.card_drafts;
drop policy if exists card_drafts_insert_own on public.card_drafts;
drop policy if exists card_drafts_delete_own on public.card_drafts;

create policy card_drafts_select_own on public.card_drafts
  for select to authenticated
  using ((select auth.jwt()->>'sub') = owner_id);

create policy card_drafts_insert_own on public.card_drafts
  for insert to authenticated
  with check (
    (select auth.jwt()->>'sub') = owner_id
    and image_path = pg_catalog.btrim(image_path)
    and image_path <> ''
    and image_path !~ '^/'
    and image_path !~ '//'
    and image_path !~ E'\\\\'
    and image_path !~* '%(?:2e|2f|5c)'
    and image_path !~ '[?#]'
    and pg_catalog.array_length(pg_catalog.string_to_array(image_path, '/'), 1) = 2
    and pg_catalog.split_part(image_path, '/', 1) = (select auth.jwt()->>'sub')
    and pg_catalog.split_part(image_path, '/', 2) not in ('', '.', '..')
  );

create policy card_drafts_delete_own on public.card_drafts
  for delete to authenticated
  using (
    (select auth.jwt()->>'sub') = owner_id
    and status <> 'processing'
  );

drop policy if exists card_images_select_own on storage.objects;
create policy card_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'card-images'
    and (
      (
        name = pg_catalog.btrim(name)
        and name <> ''
        and name !~ '^/'
        and name !~ '//'
        and name !~ E'\\\\'
        and name !~* '%(?:2e|2f|5c)'
        and name !~ '[?#]'
        and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 2
        and pg_catalog.split_part(name, '/', 1) = (select auth.jwt()->>'sub')
        and pg_catalog.split_part(name, '/', 2) not in ('', '.', '..')
      )
      or exists (
        select 1
        from public.cards as c
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
    and name = pg_catalog.btrim(name)
    and name <> ''
    and name !~ '^/'
    and name !~ '//'
    and name !~ E'\\\\'
    and name !~* '%(?:2e|2f|5c)'
    and name !~ '[?#]'
    and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 2
    and pg_catalog.split_part(name, '/', 1) = (select auth.jwt()->>'sub')
    and pg_catalog.split_part(name, '/', 2) not in ('', '.', '..')
  );

drop policy if exists card_images_update_own on storage.objects;
create policy card_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'card-images'
    and name = pg_catalog.btrim(name)
    and name <> ''
    and name !~ '^/'
    and name !~ '//'
    and name !~ E'\\\\'
    and name !~* '%(?:2e|2f|5c)'
    and name !~ '[?#]'
    and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 2
    and pg_catalog.split_part(name, '/', 1) = (select auth.jwt()->>'sub')
    and pg_catalog.split_part(name, '/', 2) not in ('', '.', '..')
  )
  with check (
    bucket_id = 'card-images'
    and name = pg_catalog.btrim(name)
    and name <> ''
    and name !~ '^/'
    and name !~ '//'
    and name !~ E'\\\\'
    and name !~* '%(?:2e|2f|5c)'
    and name !~ '[?#]'
    and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 2
    and pg_catalog.split_part(name, '/', 1) = (select auth.jwt()->>'sub')
    and pg_catalog.split_part(name, '/', 2) not in ('', '.', '..')
  );

drop policy if exists card_images_delete_own on storage.objects;
create policy card_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (
      (
        name = pg_catalog.btrim(name)
        and name <> ''
        and name !~ '^/'
        and name !~ '//'
        and name !~ E'\\\\'
        and name !~* '%(?:2e|2f|5c)'
        and name !~ '[?#]'
        and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 2
        and pg_catalog.split_part(name, '/', 1) = (select auth.jwt()->>'sub')
        and pg_catalog.split_part(name, '/', 2) not in ('', '.', '..')
      )
      or exists (
        select 1
        from public.cards as c
        where c.image_path = storage.objects.name
          and c.owner_id = (select auth.jwt()->>'sub')
      )
    )
  );

alter table public.cards enable row level security;
alter table public.card_drafts enable row level security;
alter table public.ai_tokens enable row level security;
alter table public.ai_settings enable row level security;

revoke all privileges on table public.cards from public, anon, authenticated;
revoke all privileges on table public.card_drafts from public, anon, authenticated;
revoke all privileges on table public.ai_tokens from public, anon, authenticated;
revoke all privileges on table public.ai_settings from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;

grant select, delete on table public.cards to authenticated;
grant update (
  name, name_en, title, department, company, company_en, phone, mobile, mobile2,
  fax, email, email2, website, address, postal_code, tax_code, raw_text,
  industry, capabilities, capabilities_source, confidence, notes, met_at,
  met_context, embedding
) on table public.cards to authenticated;

grant select on table public.card_drafts to authenticated;
grant insert (owner_id, image_path) on table public.card_drafts to authenticated;
grant delete on table public.card_drafts to authenticated;

grant select, insert, update, delete on table public.ai_tokens to authenticated;
grant select, insert, update, delete on table public.ai_settings to authenticated;

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.normalize_company(text) from public, anon, authenticated;
revoke execute on function public.claim_card_draft(uuid) from public, anon, authenticated;
revoke execute on function public.complete_card_draft_extraction(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_card_draft_extraction(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finalize_card_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.save_card(jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.my_capability_tags() from public, anon, authenticated;
revoke execute on function public.find_duplicate_candidates(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.search_cards(text[], integer) from public, anon, authenticated;
revoke execute on function public.company_capabilities(text, uuid) from public, anon, authenticated;
revoke execute on function public.apply_draft_enrich(text, jsonb) from public, anon, authenticated;
revoke execute on function public.companies_needing_capabilities() from public, anon, authenticated;
revoke execute on function public.apply_company_capabilities(text, text[], text) from public, anon, authenticated;

grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.normalize_company(text) to authenticated;
grant execute on function public.claim_card_draft(uuid) to authenticated;
grant execute on function public.complete_card_draft_extraction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fail_card_draft_extraction(uuid, uuid, text) to authenticated;
grant execute on function public.finalize_card_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.save_card(jsonb, text, uuid) to authenticated;
grant execute on function public.my_capability_tags() to authenticated;
grant execute on function public.find_duplicate_candidates(text, text, text, text, text, text) to authenticated;
grant execute on function public.search_cards(text[], integer) to authenticated;
grant execute on function public.company_capabilities(text, uuid) to authenticated;
grant execute on function public.apply_draft_enrich(text, jsonb) to authenticated;
grant execute on function public.companies_needing_capabilities() to authenticated;
grant execute on function public.apply_company_capabilities(text, text[], text) to authenticated;
