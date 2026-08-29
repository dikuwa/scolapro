begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','report-publisher@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','other-publisher@example.test','authenticated','authenticated',now(),now());

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values (
  'fd100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  2026,1,'TEST_TEMPLATE',991,'{}'::jsonb,'certified',
  'fd000000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',now()
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$update public.report_card_snapshots set status='published',published_at=now() where id='fd100000-0000-4000-8000-000000000001'$$,
  'first publication transition remains valid'
);

select is(
  (select published_by_user_id from public.report_card_snapshots where id='fd100000-0000-4000-8000-000000000001'),
  'fd000000-0000-4000-8000-000000000001'::uuid,
  'publication transition stamps the authenticated publisher'
);

select ok(
  (select published_at is not null from public.report_card_snapshots where id='fd100000-0000-4000-8000-000000000001'),
  'publication transition retains publication timestamp provenance'
);

select throws_ok(
  $$update public.report_card_snapshots set published_by_user_id='fd000000-0000-4000-8000-000000000002' where id='fd100000-0000-4000-8000-000000000001'$$,
  'Report-card publication actor is immutable',
  'published report actor cannot be rewritten'
);

select has_index(
  'public','report_card_snapshots','report_card_snapshots_published_by_idx',
  'publisher foreign-key lookups have a covering index'
);

select * from finish();
rollback;