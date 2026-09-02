begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fcf00000-0000-4000-8000-000000000001','subject-school-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcf00000-0000-4000-8000-000000000002','subject-school-hod@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('fcf10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Subject Isolation School','SREG-ISO-002','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcf00000-0000-4000-8000-000000000001','school_admin',current_date-2),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcf00000-0000-4000-8000-000000000002','hod',current_date-2);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
  ('fcf20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001',2026,'10','Grade 10');
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name) values
  ('fcf30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001','fcf20000-0000-4000-8000-000000000001',2026,'10A','Grade 10 A');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
  ('fcf40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other','School Learner','female'),
  ('fcf40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Target','School Learner','male');

insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source) values
  ('fcf50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001','fcf40000-0000-4000-8000-000000000001','SAME-ADM','imported'),
  ('fcf50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcf40000-0000-4000-8000-000000000002','TARGET-ADM','imported');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status) values
  ('fcf60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001','fcf40000-0000-4000-8000-000000000001',2026,'fcf20000-0000-4000-8000-000000000001','fcf30000-0000-4000-8000-000000000001','SAME-ADM','2026-01-01','current'),
  ('fcf60000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcf40000-0000-4000-8000-000000000002',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','TARGET-ADM','2026-01-01','current');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fcf70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001','CROSS','Other School Subject','active'),
  ('fcf70000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TARGET','Target School Subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fcf80000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcf10000-0000-4000-8000-000000000001',2026,'fcf70000-0000-4000-8000-000000000001','fcf20000-0000-4000-8000-000000000001',5,'active'),
  ('fcf80000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fcf70000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-school-isolation.csv',null)$$,
  'target-school import manager can create isolation batch'
);
select set_config('qa.sreg_isolation_batch',(select id::text from public.import_batches where source_file_name='subject-school-isolation.csv'),true);

select is(
  public.stage_import_rows(
    current_setting('qa.sreg_isolation_batch')::uuid,
    '[{"row_number":2,"normalized":{"admission_number":"SAME-ADM","academic_year":2026,"subject_code":"TARGET","action":"register"}},{"row_number":3,"normalized":{"admission_number":"TARGET-ADM","academic_year":2026,"subject_code":"CROSS","action":"register"}}]'::jsonb
  ),2,
  'cross-school collision rows stage for governed reconciliation'
);

select is(
  (public.reconcile_subject_registration_import_batch(current_setting('qa.sreg_isolation_batch')::uuid)->>'error')::integer,
  2,
  'reconciliation rejects both cross-school identifier and subject-code collisions'
);

select is(
  (select resolution from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=2),
  'error',
  'admission number that exists only in another school does not resolve'
);
select like(
  (select issues->0->>'message' from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=2),
  '%this school admission number%',
  'cross-school learner collision reports school-scoped identifier failure'
);
select is(
  (select matched_entity_id from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=2),
  null::uuid,
  'cross-school learner is never attached as a matched entity'
);

select is(
  (select resolution from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=3),
  'error',
  'subject code that exists only in another school does not resolve'
);
select like(
  (select issues->0->>'message' from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=3),
  '%not configured for this school%',
  'cross-school subject collision reports school-scoped subject failure'
);
select is(
  (select matched_entity_id from public.import_rows where batch_id=current_setting('qa.sreg_isolation_batch')::uuid and row_number=3),
  null::uuid,
  'cross-school subject is never attached as a matched entity'
);

select throws_ok(
  $$select public.mark_import_batch_ready(current_setting('qa.sreg_isolation_batch')::uuid)$$,
  'P0001','Resolve review/error rows before committing',
  'cross-school reconciliation errors block ready transition'
);

reset role;
select is(
  (select count(*)::integer from public.learner_subject_registrations where enrolment_id in ('fcf60000-0000-4000-8000-000000000001','fcf60000-0000-4000-8000-000000000002')),
  0,
  'failed cross-school rows create no learner subject registrations'
);

select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-hod-denied.csv',null)$$,
  'P0001','Permission denied',
  'HOD cannot create a governed subject-registration import batch'
);
reset role;

select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-valid-scope.csv',null)$$,
  'school admin can create a valid same-school control batch'
);
select set_config('qa.sreg_valid_batch',(select id::text from public.import_batches where source_file_name='subject-valid-scope.csv'),true);
select is(
  public.stage_import_rows(current_setting('qa.sreg_valid_batch')::uuid,'[{"row_number":2,"normalized":{"admission_number":"TARGET-ADM","academic_year":2026,"subject_code":"TARGET","action":"register"}}]'::jsonb),
  1,
  'same-school control row stages'
);
select is(
  (public.reconcile_subject_registration_import_batch(current_setting('qa.sreg_valid_batch')::uuid)->>'register')::integer,
  1,
  'same-school identifier and offering resolve normally'
);
select is(
  (select normalized_data->>'learner_id' from public.import_rows where batch_id=current_setting('qa.sreg_valid_batch')::uuid and row_number=2),
  'fcf40000-0000-4000-8000-000000000002',
  'same-school control resolves the intended learner identity'
);
reset role;

select * from finish();
rollback;
