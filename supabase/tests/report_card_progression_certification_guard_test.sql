begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f8000000-0000-4000-8000-000000000001','report-cert-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8000000-0000-4000-8000-000000000001','principal',current_date);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values
  ('f8100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,3,'TEST_PROGRESS_REPORT',20,'{"year_end_progression":{"status":"reviewed","outcome":"promoted"}}'::jsonb,'draft','f8000000-0000-4000-8000-000000000001'),
  ('f8100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',2026,3,'TEST_PROGRESS_REPORT',20,'{"year_end_progression":{"status":"approved","outcome":"promoted"}}'::jsonb,'draft','f8000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.certify_report_card_snapshot('f8100000-0000-4000-8000-000000000001')$$,
  'Report card contains a progression decision that is not approved',
  'report containing reviewed progression cannot be certified as official'
);

select is(
  (select status from public.report_card_snapshots where id='f8100000-0000-4000-8000-000000000001'),
  'draft',
  'rejected report remains a draft and can be rebuilt after progression approval'
);

select lives_ok(
  $$select public.certify_report_card_snapshot('f8100000-0000-4000-8000-000000000002')$$,
  'report containing approved progression can be certified'
);

select is(
  (select status from public.report_card_snapshots where id='f8100000-0000-4000-8000-000000000002'),
  'certified',
  'approved progression report becomes certified'
);

select is(
  (select count(*)::integer from public.audit_events where entity_id='f8100000-0000-4000-8000-000000000002' and event_type='report_card.snapshot.certified'),
  1,
  'successful certification retains audit provenance'
);

select * from finish();
rollback;