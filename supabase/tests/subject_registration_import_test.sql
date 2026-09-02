begin;

select plan(31);

select ok(to_regprocedure('public.reconcile_subject_registration_import_batch(uuid)') is not null,'subject-registration import reconciliation exists');
select ok(to_regprocedure('public.commit_subject_registration_import_batch(uuid)') is not null,'subject-registration import commit exists');
select ok(not has_function_privilege('anon','public.reconcile_subject_registration_import_batch(uuid)','EXECUTE'),'anonymous users cannot reconcile subject-registration imports');
select ok(not has_function_privilege('anon','public.commit_subject_registration_import_batch(uuid)','EXECUTE'),'anonymous users cannot commit subject-registration imports');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fca00000-0000-4000-8000-000000000001','subject-import-admin@example.test','authenticated','authenticated',now(),now()),
  ('fca00000-0000-4000-8000-000000000002','subject-import-hod@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca00000-0000-4000-8000-000000000001','school_admin',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca00000-0000-4000-8000-000000000002','hod',current_date-5);

insert into public.school_learner_identifiers(tenant_id,school_id,learner_id,admission_number,source)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','DEMO-001','qa'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','DEMO-002','qa')
on conflict do nothing;

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fca10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SREG','Subject Registration Import','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fca20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fca10000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-register.csv',null)$$,
  'school import manager can create a subject-registration batch'
);
select is(
  public.stage_import_rows(
    (select id from public.import_batches where source_file_name='subject-register.csv'),
    '[{"row_number":1,"normalized":{"admission_number":"DEMO-001","academic_year":2026,"subject_code":"SREG","action":"register"}},{"row_number":2,"normalized":{"admission_number":"DEMO-002","academic_year":2026,"subject_code":"SREG","action":"register"}}]'::jsonb
  ),2,'two subject-registration rows can be staged'
);
select is(
  (public.reconcile_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-register.csv'))->>'register')::integer,
  2,'reconciliation identifies two new registrations'
);
select is((select error_rows from public.import_batches where source_file_name='subject-register.csv'),0,'valid registration batch has no errors');
select is((select count(*)::integer from public.import_rows r join public.import_batches b on b.id=r.batch_id where b.source_file_name='subject-register.csv' and r.resolution='create'),2,'both valid rows resolve to create');
select is(public.mark_import_batch_ready((select id from public.import_batches where source_file_name='subject-register.csv')),true,'valid registration batch can be marked ready');
select is(
  (public.commit_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-register.csv'))->>'created')::integer,
  2,'commit creates both subject registrations'
);
reset role;

select is((select count(*)::integer from public.learner_subject_registrations where subject_offering_id='fca20000-0000-4000-8000-000000000001' and status='active'),2,'two active subject registrations exist after commit');
select is((select count(*)::integer from public.audit_events where event_type='import.subject_registrations.committed' and actor_user_id='fca00000-0000-4000-8000-000000000001'),1,'commit leaves one batch-level audit event');

set local role authenticated;
select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-repeat.csv',null)$$,
  'a retry/repeat subject-registration batch can be created'
);
select is(
  public.stage_import_rows(
    (select id from public.import_batches where source_file_name='subject-repeat.csv'),
    '[{"row_number":1,"normalized":{"admission_number":"DEMO-001","academic_year":2026,"subject_code":"SREG","action":"register"}},{"row_number":2,"normalized":{"admission_number":"DEMO-002","academic_year":2026,"subject_code":"SREG","action":"register"}}]'::jsonb
  ),2,'repeat rows can be staged'
);
select is(
  (public.reconcile_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-repeat.csv'))->>'skip')::integer,
  2,'repeat reconciliation identifies already-active registrations as skips'
);
select is(public.mark_import_batch_ready((select id from public.import_batches where source_file_name='subject-repeat.csv')),true,'all-skip retry batch can be marked ready');
select is(
  (public.commit_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-repeat.csv'))->>'skipped')::integer,
  2,'repeat commit records two skips'
);
reset role;
select is((select count(*)::integer from public.learner_subject_registrations where subject_offering_id='fca20000-0000-4000-8000-000000000001'),2,'repeat import does not duplicate registration identities');

set local role authenticated;
select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-withdraw.csv',null)$$,
  'withdraw/correction subject-registration batch can be created'
);
select is(
  public.stage_import_rows(
    (select id from public.import_batches where source_file_name='subject-withdraw.csv'),
    '[{"row_number":1,"normalized":{"admission_number":"DEMO-002","academic_year":2026,"subject_code":"SREG","action":"withdraw"}},{"row_number":2,"normalized":{"admission_number":"DEMO-001","academic_year":2026,"subject_code":"UNKNOWN","action":"register"}}]'::jsonb
  ),2,'withdraw and invalid rows can be staged for review'
);
select is(
  (public.reconcile_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-withdraw.csv'))->>'error')::integer,
  1,'reconciliation reports the unknown subject row as an error'
);
select is((select resolution from public.import_rows r join public.import_batches b on b.id=r.batch_id where b.source_file_name='subject-withdraw.csv' and r.row_number=1),'update','active registration resolves to update for withdrawal');
select is((select resolution from public.import_rows r join public.import_batches b on b.id=r.batch_id where b.source_file_name='subject-withdraw.csv' and r.row_number=2),'error','unknown subject code fails closed');
select throws_ok(
  $$select public.mark_import_batch_ready((select id from public.import_batches where source_file_name='subject-withdraw.csv'))$$,
  'P0001','Resolve review/error rows before committing','batch with reconciliation error cannot be marked ready'
);
select is(
  public.stage_import_rows(
    (select id from public.import_batches where source_file_name='subject-withdraw.csv'),
    '[{"row_number":2,"normalized":{"admission_number":"DEMO-001","academic_year":2026,"subject_code":"SREG","action":"register"}}]'::jsonb
  ),1,'invalid row can be corrected in staging without replacing the batch'
);
select is(
  (public.reconcile_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-withdraw.csv'))->>'error')::integer,
  0,'corrected batch reconciles without errors'
);
select is(public.mark_import_batch_ready((select id from public.import_batches where source_file_name='subject-withdraw.csv')),true,'corrected batch can be marked ready');
reset role;

select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.commit_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-withdraw.csv'))$$,
  'P0001','Permission denied','HOD cannot bypass the school import-management commit boundary'
);
reset role;

select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (public.commit_subject_registration_import_batch((select id from public.import_batches where source_file_name='subject-withdraw.csv'))->>'updated')::integer,
  1,'authorized import manager commits the one withdrawal update'
);
reset role;

select is((select status from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000002' and subject_offering_id='fca20000-0000-4000-8000-000000000001'),'withdrawn','withdraw action preserves registration identity and records withdrawn state');
select is((select status from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and subject_offering_id='fca20000-0000-4000-8000-000000000001'),'active','unrelated already-active learner remains active');
select is((select count(*)::integer from public.import_commit_results cr join public.import_batches b on b.id=cr.batch_id where b.source_file_name in ('subject-register.csv','subject-repeat.csv','subject-withdraw.csv')),6,'every committed import row leaves a durable commit result');
select is((select count(*)::integer from public.audit_events where event_type='import.subject_registrations.committed' and actor_user_id='fca00000-0000-4000-8000-000000000001'),3,'each completed subject-registration batch leaves batch-level audit evidence');

select * from finish();
rollback;
