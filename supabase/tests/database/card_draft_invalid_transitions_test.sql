begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

create or replace function pg_temp.task2_valid_enrich(
  p_capabilities integer default 1,
  p_sources integer default 1
)
returns jsonb
language sql
as $$
  select pg_catalog.jsonb_build_object(
    'industry', 'Manufacturing',
    'capabilities', (
      select pg_catalog.jsonb_agg('capability-' || i order by i)
      from pg_catalog.generate_series(1, p_capabilities) as i
    ),
    'summary', 'Bounded source-backed summary',
    'confident', true,
    'sources', (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('url', 'https://source-' || i || '.example.test/', 'title', 'Source ' || i)
        order by i
      )
      from pg_catalog.generate_series(1, p_sources) as i
    )
  )
$$;

create or replace function pg_temp.task2_sized_enrich(p_target integer)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb := pg_temp.task2_valid_enrich(12, 10);
  v_index integer := 0;
  v_url text;
begin
  while pg_catalog.octet_length(v_payload::text) < p_target loop
    v_index := v_index % 10;
    v_url := v_payload #>> array['sources', v_index::text, 'url'];
    if pg_catalog.char_length(v_url) >= 2048 then
      raise exception 'target payload cannot satisfy per-source URL bound';
    end if;
    v_payload := pg_catalog.jsonb_set(
      v_payload,
      array['sources', v_index::text, 'url'],
      pg_catalog.to_jsonb(v_url || 'a')
    );
    v_index := v_index + 1;
  end loop;
  if pg_catalog.octet_length(v_payload::text) <> p_target then
    raise exception 'payload byte size mismatch';
  end if;
  return v_payload;
end;
$$;

insert into public.card_drafts (
  id, owner_id, image_path, status, extracted, error, attempts,
  processing_started_at, processing_token
)
values
  (
    '22000000-0000-0000-0000-000000000001', 'user_task2_a',
    'user_task2_a/pending.jpg', 'pending', '{"company":"Task Two Co"}', null, 0, null, null
  ),
  (
    '22000000-0000-0000-0000-000000000002', 'user_task2_a',
    'user_task2_a/processing.jpg', 'processing', '{"company":"Task Two Co"}', null, 1,
    clock_timestamp(), '22000000-0000-0000-0000-000000000102'
  ),
  (
    '22000000-0000-0000-0000-000000000003', 'user_task2_a',
    'user_task2_a/failed.jpg', 'failed', '{"company":"Task Two Co"}', 'failed', 2, null, null
  ),
  (
    '22000000-0000-0000-0000-000000000004', 'user_task2_a',
    'user_task2_a/extracted-other.jpg', 'extracted', '{"company":"Other Co"}', null, 1, null, null
  ),
  (
    '22000000-0000-0000-0000-000000000005', 'user_task2_a',
    'user_task2_a/extracted-match.jpg', 'extracted', '{"company":"Task Two Co"}', null, 1, null, null
  );

create temporary table task2_before as
select id, to_jsonb(d) as row_value
from public.card_drafts as d
where id between '22000000-0000-0000-0000-000000000001'
             and '22000000-0000-0000-0000-000000000005';

create temporary table task2_invalid_enrich(label text, company text, payload jsonb);
insert into task2_invalid_enrich values
  ('SQL null payload', 'Task Two Co', null),
  ('JSON null payload', 'Task Two Co', 'null'::jsonb),
  ('array payload', 'Task Two Co', '[]'::jsonb),
  ('scalar payload', 'Task Two Co', '"scalar"'::jsonb),
  ('blank company', '   ', pg_temp.task2_valid_enrich()),
  ('overlong company', repeat('c', 501), pg_temp.task2_valid_enrich()),
  ('missing industry', 'Task Two Co', pg_temp.task2_valid_enrich() - 'industry'),
  ('missing capabilities', 'Task Two Co', pg_temp.task2_valid_enrich() - 'capabilities'),
  ('missing summary', 'Task Two Co', pg_temp.task2_valid_enrich() - 'summary'),
  ('missing confident', 'Task Two Co', pg_temp.task2_valid_enrich() - 'confident'),
  ('missing sources', 'Task Two Co', pg_temp.task2_valid_enrich() - 'sources'),
  ('unknown top-level key', 'Task Two Co', pg_temp.task2_valid_enrich() || '{"unknown":true}'),
  ('wrong industry type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{industry}', '[]')),
  ('wrong capabilities type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{capabilities}', '{}')),
  ('wrong summary type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{summary}', '1')),
  ('wrong confident type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{confident}', '"yes"')),
  ('wrong sources type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '{}')),
  ('source missing title', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":"https://one.test/"}]')),
  ('source missing url', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"title":"one"}]')),
  ('source extra key', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":"https://one.test/","title":"one","extra":1}]')),
  ('source wrong url type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":1,"title":"one"}]')),
  ('source wrong title type', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":"https://one.test/","title":1}]')),
  ('source non-https', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":"http://one.test/","title":"one"}]')),
  ('source overlong url', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('url', 'https://one.test/' || repeat('u', 2049), 'title', 'one')))),
  ('source overlong title', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('url', 'https://one.test/', 'title', repeat('t', 201))))),
  ('duplicate source url', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{sources}', '[{"url":"https://one.test/","title":"one"},{"url":"https://one.test/","title":"two"}]')),
  ('duplicate capability', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{capabilities}', '["one","one"]')),
  ('overlong capability', 'Task Two Co', pg_catalog.jsonb_set(pg_temp.task2_valid_enrich(), '{capabilities}', pg_catalog.jsonb_build_array(repeat('c', 81)))),
  ('eleven sources', 'Task Two Co', pg_temp.task2_valid_enrich(1, 11)),
  ('thirteen capabilities', 'Task Two Co', pg_temp.task2_valid_enrich(13, 1)),
  ('16,385 byte payload', 'Task Two Co', pg_temp.task2_sized_enrich(16385));

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_task2_a","role":"authenticated"}';

select extensions.is(
  (select code from public.apply_draft_enrich(c.company, c.payload)),
  'invalid_input',
  c.label
)
from task2_invalid_enrich as c;

select extensions.is(
  (
    select count(*)::integer
    from public.card_drafts as d
    join task2_before as b using (id)
    where to_jsonb(d) = b.row_value
  ),
  5,
  'all invalid calls preserve every byte of every row, including the eligible target'
);
select extensions.is(
  (
    select count(*)::integer
    from public.card_drafts as d
    join task2_before as b using (id)
    where d.id = '22000000-0000-0000-0000-000000000005'
      and to_jsonb(d) = b.row_value
  ),
  1,
  'invalid calls leave the extracted same-company target byte-equivalent'
);

select extensions.is(
  (select code from public.apply_draft_enrich('Task Two Co', pg_temp.task2_valid_enrich(12, 10))),
  'applied',
  'the 12-capability and 10-source boundary is valid'
);
select extensions.is(
  (select updated from public.apply_draft_enrich('Task Two Co', pg_temp.task2_sized_enrich(16384))),
  1,
  'the exact 16,384-byte enrichment boundary is valid'
);
select extensions.is(
  (
    select count(*)::integer
    from public.card_drafts as d
    join task2_before as b using (id)
    where to_jsonb(d) = b.row_value
  ),
  4,
  'valid enrichment leaves pending, processing, failed, and other-company rows byte-equivalent'
);
select extensions.is(
  (select octet_length(enrich::text) from public.card_drafts where id = '22000000-0000-0000-0000-000000000005'),
  16384,
  'only the eligible extracted same-company row receives the exact-boundary payload'
);

select extensions.is(
  (
    select code
    from public.fail_card_draft_extraction(
      '22000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000102',
      repeat('e', 1001)
    )
  ),
  'invalid_input',
  'fail rejects a 1,001-character error'
);
select extensions.is(
  (select status from public.card_drafts where id = '22000000-0000-0000-0000-000000000002'),
  'processing',
  'invalid fail input preserves processing state'
);

select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '22000000-0000-0000-0000-000000000001',
      '{"name":"pending"}',
      null
    )
  ),
  'invalid_state',
  'pending drafts cannot finalize'
);
select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '22000000-0000-0000-0000-000000000002',
      '{"name":"processing"}',
      null
    )
  ),
  'busy',
  'processing drafts cannot finalize'
);
select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '22000000-0000-0000-0000-000000000003',
      '{"owner_id":"forged","name":"invalid"}',
      null
    )
  ),
  'invalid_input',
  'card JSON cannot forge transition or ownership fields'
);

select * from extensions.finish();
rollback;
