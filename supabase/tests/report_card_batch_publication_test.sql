begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('ef000000-0000-4000-8000-000000000001','report-publish-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,
  data_snapshot,status,generated_by_user_id,certified_by_user_id,certified_at
) values(
  'ef100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'SCOLAPRO_TERM_REPORT_V1',1,
  '{}'::jsonb,'certified','ef000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001',now()
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,1,'custom','Publish learner','publish',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'management can create a durable publication batch'
);
reset role;

select is(
  (select operation from public.report_card_batches where scope_label='Publish learner'),
  'publish',
  'publication is stored as its own audited batch stage'
);
select is(
  (select export_status from public.report_card_batches where scope_label='Publish learner'),
  'not_applicable',
  'publication batches do not enter the combined PDF export queue'
);

select lives_ok(
  $$select public.process_report_card_batch_items(10)$$,
  'service worker processes publication items through the durable batch engine'
);
select is(
  (select status from public.report_card_snapshots where id='ef100000-0000-4000-8000-000000000001'),
  'published',
  'bulk publication delegates to the canonical snapshot publication transition'
);
select is(
  (select i.result_code from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id where b.scope_label='Publish learner'),
  'published',
  'learner item records an explicit published outcome'
);
select is(
  (select status from public.report_card_batches where scope_label='Publish learner'),
  'completed',
  'publication batch completes after its learner item is published'
);
select ok(
  exists(select 1 from public.audit_events where entity_id='ef100000-0000-4000-8000-000000000001'::uuid and event_type='report_card.snapshot.published'),
  'canonical publication audit event is preserved for bulk publication'
);

select * from finish();
rollback;
