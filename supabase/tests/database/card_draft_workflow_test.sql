begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.has_column('public', 'card_drafts', 'processing_started_at');
select extensions.has_column('public', 'card_drafts', 'processing_token');
select extensions.has_column('public', 'cards', 'source_draft_id');
select extensions.has_index('public', 'card_drafts', 'card_drafts_one_processing_per_owner');
select extensions.has_index('public', 'cards', 'cards_source_draft_id_uniq');

insert into public.card_drafts (id, owner_id, image_path)
values
  ('20000000-0000-0000-0000-000000000001', 'user_task2_a', 'user_task2_a/claim-a.jpg'),
  ('20000000-0000-0000-0000-000000000002', 'user_task2_a', 'user_task2_a/claim-b.jpg'),
  ('20000000-0000-0000-0000-000000000003', 'user_task2_b', 'user_task2_b/claim-c.jpg');

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_task2_a","role":"authenticated"}';

select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000001')),
  'claimed',
  'a pending draft is claimed'
);
select extensions.is(
  (select status from public.card_drafts where id = '20000000-0000-0000-0000-000000000001'),
  'processing',
  'claim transitions to processing'
);
select extensions.is(
  (select attempts from public.card_drafts where id = '20000000-0000-0000-0000-000000000001'),
  1,
  'claim increments attempts'
);
select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000002')),
  'busy',
  'a second active claim for the same owner is rejected'
);
select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000003')),
  'not_found',
  'cross-owner claim is indistinguishable from missing'
);

reset role;
update public.card_drafts
set processing_started_at = clock_timestamp() - interval '181 seconds'
where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;

select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000002')),
  'claimed',
  'a stale owner claim is expired before another draft is claimed'
);
select extensions.is(
  (select status from public.card_drafts where id = '20000000-0000-0000-0000-000000000001'),
  'pending',
  'the stale draft returns to pending'
);
select extensions.is(
  (select error from public.card_drafts where id = '20000000-0000-0000-0000-000000000001'),
  'claim_expired',
  'the stale draft records the stable expiry code'
);

reset role;
update public.card_drafts
set processing_started_at = clock_timestamp() - interval '181 seconds'
where id = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

create temporary table task2_token_before as
select processing_token as token
from public.card_drafts
where id = '20000000-0000-0000-0000-000000000002';

select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000002')),
  'claimed',
  'requesting the stale draft rotates its claim in place'
);
select extensions.isnt(
  (select processing_token from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
  (select token from task2_token_before),
  'a stale claim receives a fresh token'
);
select extensions.is(
  (select attempts from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
  2,
  'a stale reclaim increments attempts'
);

select extensions.is(
  (
    select code
    from public.complete_card_draft_extraction(
      '20000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000000',
      '{"company":"late"}'::jsonb
    )
  ),
  'stale_token',
  'a late worker cannot complete with an old token'
);
select extensions.is(
  (
    select code
    from public.complete_card_draft_extraction(
      '20000000-0000-0000-0000-000000000002',
      (select processing_token from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
      '[]'::jsonb
    )
  ),
  'invalid_input',
  'complete rejects a non-object extraction without changing the claim'
);
select extensions.is(
  (select status from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
  'processing',
  'invalid extraction leaves the draft processing'
);
select extensions.is(
  (
    select code
    from public.complete_card_draft_extraction(
      '20000000-0000-0000-0000-000000000002',
      (select processing_token from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
      '{"company":"Task Two Co"}'::jsonb
    )
  ),
  'completed',
  'the current token completes extraction'
);
select extensions.is(
  (select code from public.claim_card_draft('20000000-0000-0000-0000-000000000002')),
  'already_extracted',
  'an extracted draft is idempotently reported'
);

select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '20000000-0000-0000-0000-000000000002',
      '{"name":"Task User","company":"Task Two Co","capabilities":["one","two"],"confidence":0.8}'::jsonb,
      null
    )
  ),
  'finalized',
  'an extracted draft finalizes atomically'
);
select extensions.is(
  (select count(*)::integer from public.card_drafts where id = '20000000-0000-0000-0000-000000000002'),
  0,
  'finalization deletes the draft'
);
select extensions.is(
  (select count(*)::integer from public.cards where source_draft_id = '20000000-0000-0000-0000-000000000002'),
  1,
  'the durable source draft id is retained on the card'
);
select extensions.is(
  (
    select created
    from public.finalize_card_draft(
      '20000000-0000-0000-0000-000000000002',
      '{"name":"ignored retry"}'::jsonb,
      null
    )
  ),
  false,
  'a lost-response retry returns the prior card without creating'
);

insert into public.card_drafts (id, owner_id, image_path, status, error)
values (
  '20000000-0000-0000-0000-000000000004',
  'user_task2_a',
  'user_task2_a/manual.jpg',
  'failed',
  'provider_failed'
);
select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '20000000-0000-0000-0000-000000000004',
      '{"company":"Manual Recovery"}'::jsonb,
      null
    )
  ),
  'finalized',
  'a failed draft remains manually finalizable'
);

select extensions.is(
  (
    select code
    from public.save_card(
      '{"name":"Original","company":"Save Co"}'::jsonb,
      'user_task2_a/original.jpg',
      null
    )
  ),
  'saved',
  'save_card creates a non-draft card'
);
create temporary table task2_saved_card as
select id from public.cards where owner_id = 'user_task2_a' and image_path = 'user_task2_a/original.jpg';
select extensions.is(
  (
    select code
    from public.save_card(
      '{"name":"Replacement","company":"Save Co"}'::jsonb,
      'user_task2_a/replacement.jpg',
      (select id from task2_saved_card)
    )
  ),
  'saved',
  'save_card atomically supersedes an owned card'
);
select extensions.is(
  (select is_current from public.cards where id = (select id from task2_saved_card)),
  false,
  'only the selected prior card is made non-current'
);

reset role;
insert into public.ai_settings (owner_id, enrich_provider, enrich_model)
values ('user_task2_oauth', 'openai-codex', 'gpt-5.5');
select extensions.is(
  (select enrich_provider from public.ai_settings where owner_id = 'user_task2_oauth'),
  'openai-codex',
  'legacy OAuth company search remains an explicit experimental option'
);
select extensions.ok(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.ai_settings'::regclass
      and conname = 'ai_settings_enrich_provider_check'
  ) like '%openai-codex%openai-api%anthropic-claude%',
  'the enrich provider constraint contains OAuth experimental, official API, and Claude providers'
);

select * from extensions.finish();
rollback;
