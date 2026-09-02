begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb7a0000-0000-4000-8000-000000000001','report-readiness-snapshot@example.test','authenticated','authenticated',now(),now());

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fb7a1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SNAP-READY','Snapshot Readiness','active');
insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values (
  'fb7a2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'fb7a1000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'
);

insert into public.learner_subject_registrations(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,
  status,source,registered_by_user_id,registered_at,created_at,updated_at
) values (
  'fb7a3000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb7a2000-0000-4000-8000-000000000001',
  'active','qa','fb7a0000-0000-4000-8000-000000000001',now(),now(),now()
);

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,symbol,assessment_scheme_key,assessment_scheme_version,academic_rule_set_key,
  academic_rule_set_version,calculation_snapshot,approved_by_user_id,approved_at,locked_at
) values (
  'fb7a4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb7a2000-0000-4000-8000-000000000001',
  6,81,'A','SNAP-QA','1','SNAP-QA','1','{}'::jsonb,'fb7a0000-0000-4000-8000-000000000001',now(),now()
);

select ok(
  not has_function_privilege('authenticated','app_private.enrich_report_card_snapshot_subject_readiness()','EXECUTE'),
  'authenticated clients cannot execute the snapshot-enrichment helper directly'
);
select is(
  (select count(*)::integer from pg_trigger where tgname='report_card_snapshot_subject_readiness_enrichment_trg' and not tgisinternal),
  1,
  'report-card subject-readiness enrichment trigger is installed exactly once'
);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values (
  'fb7a5000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,6,
  'SCOLAPRO_TERM_REPORT_V1',91,'{"fixture":"kept"}'::jsonb,'draft','fb7a0000-0000-4000-8000-000000000001'
);

select is(
  (select data_snapshot->>'fixture' from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  'kept',
  'enrichment preserves the report builder data already present in the snapshot'
);
select is(
  (select data_snapshot#>>'{subject_result_readiness,reconciliation_status}' from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  'reconciled',
  'new snapshot freezes reconciled subject/result readiness'
);
select is(
  (select (data_snapshot#>>'{subject_result_readiness,registered_subject_count}')::integer from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  1,
  'snapshot freezes the active registered-subject count'
);
select is(
  (select (data_snapshot#>>'{subject_result_readiness,official_result_count}')::integer from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  1,
  'snapshot freezes the official-result count'
);
select is(
  (select (data_snapshot#>>'{subject_result_readiness,blocking}')::boolean from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  false,
  'frozen subject readiness remains explicitly non-blocking'
);

update public.learner_subject_registrations
set status='withdrawn',withdrawn_by_user_id='fb7a0000-0000-4000-8000-000000000001',withdrawn_at=now(),withdrawal_reason='qa withdrawal'
where id='fb7a3000-0000-4000-8000-000000000001';

select is(
  (app_private.build_learner_subject_result_readiness('60000000-0000-4000-8000-000000000001',6::smallint)->>'reconciliation_status'),
  'legacy_results_without_registrations',
  'live readiness changes after the subject choice is withdrawn'
);
select is(
  (select data_snapshot#>>'{subject_result_readiness,reconciliation_status}' from public.report_card_snapshots where id='fb7a5000-0000-4000-8000-000000000001'),
  'reconciled',
  'previously generated snapshot retains its original readiness evidence after later subject-choice changes'
);

select * from finish();
rollback;