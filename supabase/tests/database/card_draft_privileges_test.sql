begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.ok(has_table_privilege('authenticated', 'public.cards', 'select'), 'cards are readable');
select extensions.ok(has_table_privilege('authenticated', 'public.cards', 'delete'), 'owned cards are deletable through RLS');
select extensions.ok(not has_table_privilege('authenticated', 'public.cards', 'insert'), 'cards have no direct authenticated insert');
select extensions.ok(not has_table_privilege('authenticated', 'public.cards', 'update'), 'cards do not have broad table update');
select extensions.ok(has_column_privilege('authenticated', 'public.cards', 'name', 'update'), 'application fields are directly editable');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'owner_id', 'update'), 'owner_id is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'image_path', 'update'), 'image_path is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'status', 'update'), 'status is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'is_current', 'update'), 'is_current is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'supersedes_id', 'update'), 'supersedes_id is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'source_draft_id', 'update'), 'source_draft_id update is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.cards', 'source_draft_id', 'insert'), 'source_draft_id insert is protected');

select extensions.ok(has_table_privilege('authenticated', 'public.card_drafts', 'select'), 'drafts are readable');
select extensions.ok(has_table_privilege('authenticated', 'public.card_drafts', 'delete'), 'non-processing drafts are deletable through RLS');
select extensions.ok(not has_table_privilege('authenticated', 'public.card_drafts', 'update'), 'drafts have no direct authenticated update');
select extensions.ok(has_column_privilege('authenticated', 'public.card_drafts', 'owner_id', 'insert'), 'draft owner is insertable');
select extensions.ok(has_column_privilege('authenticated', 'public.card_drafts', 'image_path', 'insert'), 'draft image path is insertable');
select extensions.ok(not has_column_privilege('authenticated', 'public.card_drafts', 'status', 'insert'), 'draft status is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.card_drafts', 'extracted', 'insert'), 'draft extraction is protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.card_drafts', 'attempts', 'insert'), 'draft attempts are protected');
select extensions.ok(not has_column_privilege('authenticated', 'public.card_drafts', 'processing_token', 'insert'), 'draft token is protected');

select extensions.ok(not has_schema_privilege('authenticated', 'public', 'create'), 'authenticated cannot create public objects');
select extensions.ok(has_schema_privilege('authenticated', 'public', 'usage'), 'authenticated can use public API objects');
select extensions.ok(not has_schema_privilege('anon', 'public', 'create'), 'anon cannot create public objects');

create temporary table task2_expected_functions(signature text primary key);
insert into task2_expected_functions(signature) values
  ('apply_company_capabilities(text,text[],text)'),
  ('apply_draft_enrich(text,jsonb)'),
  ('claim_card_draft(uuid)'),
  ('companies_needing_capabilities()'),
  ('company_capabilities(text,uuid)'),
  ('complete_card_draft_extraction(uuid,uuid,jsonb)'),
  ('fail_card_draft_extraction(uuid,uuid,text)'),
  ('finalize_card_draft(uuid,jsonb,uuid)'),
  ('find_duplicate_candidates(text,text,text,text,text,text)'),
  ('my_capability_tags()'),
  ('normalize_company(text)'),
  ('save_card(jsonb,text,uuid)'),
  ('search_cards(text[],integer)'),
  ('set_updated_at()');

create temporary view task2_application_functions as
select
  p.oid,
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
  p.prosecdef,
  p.proconfig,
  pg_get_functiondef(p.oid) as definition,
  pg_get_userbyid(p.proowner) as owner_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (
    select 1
    from pg_depend d
    join pg_extension e on e.oid = d.refobjid
    where d.classid = 'pg_proc'::regclass
      and d.objid = p.oid
      and d.deptype = 'e'
  );

select extensions.is_empty(
  $$
    (select signature from task2_expected_functions except select signature from task2_application_functions)
    union all
    (select signature from task2_application_functions except select signature from task2_expected_functions)
  $$,
  'the non-extension public function inventory is exact'
);

select extensions.is_empty(
  $$
    select signature
    from task2_application_functions
    where has_function_privilege('public', oid, 'execute')
       or has_function_privilege('anon', oid, 'execute')
  $$,
  'no application-owned public function is executable by PUBLIC or anon'
);
select extensions.is_empty(
  $$
    select signature
    from task2_application_functions
    where not has_function_privilege('authenticated', oid, 'execute')
  $$,
  'the exact application function API is executable by authenticated'
);

select extensions.set_eq(
  $$
    select signature
    from task2_application_functions
    where prosecdef
  $$,
  $$
    values
      ('apply_draft_enrich(text,jsonb)'),
      ('claim_card_draft(uuid)'),
      ('complete_card_draft_extraction(uuid,uuid,jsonb)'),
      ('fail_card_draft_extraction(uuid,uuid,text)'),
      ('finalize_card_draft(uuid,jsonb,uuid)'),
      ('save_card(jsonb,text,uuid)')
  $$,
  'only audited mutation boundaries are security definers'
);
select extensions.is_empty(
  $$
    select signature
    from task2_application_functions
    where prosecdef
      and (
        proconfig is distinct from array['search_path=']
        or owner_name <> 'postgres'
        or definition not like '%auth.jwt()%'
        or definition not like '%owner_id%'
      )
  $$,
  'every definer is postgres-owned, empty-search-path, and checks Clerk ownership'
);

select extensions.ok(
  exists (
    select 1
    from pg_proc p
    join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and e.extname in ('pg_trgm', 'vector')
  ),
  'extension-owned public routines are classified separately'
);
select extensions.is_empty(
  $$
    select sequence_schema || '.' || sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
      and (
        has_sequence_privilege('authenticated', sequence_schema || '.' || sequence_name, 'usage')
        or has_sequence_privilege('anon', sequence_schema || '.' || sequence_name, 'usage')
      )
  $$,
  'UUID defaults require no public sequence privileges'
);

select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.cards'::regclass),
  true,
  'cards RLS remains enabled'
);
select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.card_drafts'::regclass),
  true,
  'draft RLS remains enabled'
);
select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.ai_tokens'::regclass),
  true,
  'token RLS remains enabled'
);
select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.ai_settings'::regclass),
  true,
  'settings RLS remains enabled'
);

select * from extensions.finish();
rollback;
