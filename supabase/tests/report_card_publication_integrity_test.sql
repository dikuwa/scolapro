begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','report-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','principal',current_date);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at,published_at
) values
  ('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'TEST_REPORT_V1',1,'{"version":1,"result":"original"}'::jsonb,'published','fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',now()-interval '1 day',now()-interval '1 day'),
  ('fb100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'TEST_REPORT_V1',2,'{"version":2,"result":"corrected"}'::jsonb,'certified','fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',now(),null);

update public.report_card_snapshots
set supersedes_snapshot_id='fb100000-0000-4000-8000-000000000001'
where id='fb100000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.publish_report_card_snapshot('fb100000-0000-4000-8000-000000000002')$$,
  'certified corrected report can be published'
);

select is(
  (select status from public.report_card_snapshots where id='fb100000-0000-4000-8000-000000000001'),
  'superseded',
  'previous published report is superseded atomically when replacement is published'
);

select is(
  (select status from public.report_card_snapshots where id='fb100000-0000-4000-8000-000000000002'),
  'published',
  'replacement becomes the current published report'
);

select is(
  (select count(*)::integer from public.report_card_snapshots where enrolment_id='60000000-0000-4000-8000-000000000001' and term_number=1 and status='published'),
  1,
  'only one report remains published for the learner and term'
);

select throws_ok(
  $$update public.report_card_snapshots set data_snapshot='{"tampered":true}'::jsonb where id='fb100000-0000-4000-8000-000000000002'$$,
  'Certified report-card snapshot content is immutable',
  'published report payload cannot be rewritten'
);

select throws_ok(
  $$delete from public.report_card_snapshots where id='fb100000-0000-4000-8000-000000000001'$$,
  'Certified or published report-card snapshots cannot be deleted',
  'superseded historical report cannot be deleted'
);

select is(
  (select data_snapshot->>'result' from public.report_card_snapshots where id='fb100000-0000-4000-8000-000000000001'),
  'original',
  'superseded report retains its original historical payload'
);

select is(
  (select count(*)::integer from public.audit_events where entity_id='fb100000-0000-4000-8000-000000000002' and event_type='report_card.snapshot.published'),
  1,
  'replacement publication is auditable'
);

select * from finish();
rollback;