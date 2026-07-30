begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into public.cards (
  id, owner_id, image_path, status, name, company, is_current
)
values
  (
    '23000000-0000-0000-0000-000000000001',
    'user_task2_b',
    'user_task2_b/private.jpg',
    'confirmed',
    'Owner B',
    'Private Co',
    true
  ),
  (
    '23000000-0000-0000-0000-000000000002',
    'legacy-owner-a',
    'legacy-folder/legacy.jpg',
    'confirmed',
    'Legacy A',
    'Legacy Co',
    true
  );

insert into public.card_drafts (id, owner_id, image_path)
values (
  '23000000-0000-0000-0000-000000000003',
  'user_task2_b',
  'user_task2_b/private-draft.jpg'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('card-images', 'user_task2_b/private.jpg', 'user_task2_b', '{}'::jsonb)
on conflict do nothing;

create temporary table task2_cross_owner_before as
select id, to_jsonb(c) as row_value
from public.cards as c
where id in (
  '23000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000002'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_task2_a","role":"authenticated"}';

select extensions.is(
  (select code from public.claim_card_draft('23000000-0000-0000-0000-000000000003')),
  'not_found',
  'cross-owner draft claim is denied'
);
select extensions.is(
  (
    select code
    from public.finalize_card_draft(
      '23000000-0000-0000-0000-000000000003',
      '{"name":"forged"}',
      null
    )
  ),
  'not_found',
  'cross-owner finalization is denied'
);
select extensions.is(
  (
    select code
    from public.save_card(
      '{"name":"forged supersede"}',
      'user_task2_a/new.jpg',
      '23000000-0000-0000-0000-000000000001'
    )
  ),
  'not_found',
  'save_card cannot supersede a cross-owner card'
);
select extensions.is(
  (
    select count(*)::integer
    from public.cards as c
    join task2_cross_owner_before as b using (id)
    where to_jsonb(c) = b.row_value
  ),
  2,
  'cross-owner RPC attempts leave both cards byte-equivalent'
);

select extensions.throws_ok(
  $$
    insert into public.cards (owner_id, image_path, name)
    values ('user_task2_a', 'user_task2_b/private.jpg', 'forged')
  $$,
  '42501',
  null,
  'authenticated cannot directly insert cards'
);
select extensions.throws_ok(
  $$
    update public.cards
    set source_draft_id = '23000000-0000-0000-0000-000000000099'
    where id = '23000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated cannot directly forge source_draft_id'
);
select extensions.throws_ok(
  $$
    update public.card_drafts
    set status = 'extracted',
        extracted = '{"company":"forged"}',
        attempts = 99,
        processing_token = '23000000-0000-0000-0000-000000000098'
    where id = '23000000-0000-0000-0000-000000000003'
  $$,
  '42501',
  null,
  'authenticated cannot directly forge draft transition columns'
);

create temporary table task2_bad_paths(path text);
insert into task2_bad_paths(path) values
  (''),
  ('/user_task2_a/absolute.jpg'),
  ('user_task2_a//double.jpg'),
  ('user_task2_a/../traversal.jpg'),
  ('user_task2_a/%2e%2e/encoded.jpg'),
  (E'user_task2_a\\backslash.jpg'),
  ('user_task2_b/private.jpg'),
  ('card-images/user_task2_a/wrong-bucket.jpg');

select extensions.throws_ok(
  pg_catalog.format(
    'insert into public.card_drafts (owner_id, image_path) values (%L, %L)',
    'user_task2_a',
    p.path
  ),
  '42501',
  null,
  'draft insert rejects adversarial path: ' || p.path
)
from task2_bad_paths as p;

insert into public.card_drafts (owner_id, image_path)
values ('user_task2_a', 'user_task2_a/ordinary.jpg');
select extensions.is(
  (
    select count(*)::integer
    from public.card_drafts
    where owner_id = 'user_task2_a' and image_path = 'user_task2_a/ordinary.jpg'
  ),
  1,
  'an exact same-owner draft path remains valid'
);
select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'card-images' and name = 'user_task2_b/private.jpg'
  ),
  0,
  'owner A cannot select owner B storage object'
);

reset role;
update public.cards
set owner_id = 'user_task2_a'
where id = '23000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_task2_a","role":"authenticated"}';
update public.cards
set notes = 'legacy edit remains allowed'
where id = '23000000-0000-0000-0000-000000000002';
select extensions.is(
  (select notes from public.cards where id = '23000000-0000-0000-0000-000000000002'),
  'legacy edit remains allowed',
  'immutable legacy image paths do not block ordinary field edits'
);

select * from extensions.finish();
rollback;
