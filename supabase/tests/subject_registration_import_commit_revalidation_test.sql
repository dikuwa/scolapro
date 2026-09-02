begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fcd00000-0000-4000-8000-000000000001','subject-commit-race-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd00000-0000-4000-8000-000000000001','school_admin',current_date-2);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values('fcd10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Commit','Race Learner','female');
insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source)
values('fcd20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd10000-0000-4000-8000-000000000001','RACE-ADM','imported');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status)
values('fcd30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd10000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','RACE-ADM','2026-01-01','current');
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fcd40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','RACE-SUB','Commit Race Subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fcd50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fcd40000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcd00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.register_learner_subject('fcd30000-0000-4000-8000-000000000001','fcd50000-0000-4000-8000-000000000001','manual')$$,
  'control registration starts active'
);
select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','race-register.csv',null)$$,
  'register race batch can be created'
);
select set_config('qa.race_register_batch',(select id::text from public.import_batches where source_file_name='race-register.csv'),true);
select is(public.stage_import_rows(current_setting('qa.race_register_batch')::uuid,'[{"row_number":2,"normalized":{"admission_number":"RACE-ADM","academic_year":2026,"subject_code":"RACE-SUB","action":"register"}}]'::jsonb),1,'register race row stages');
select is((public.reconcile_subject_registration_import_batch(current_setting('qa.race_register_batch')::uuid)->>'skip')::integer,1,'register row previews as skip while registration is active');
select is(public.mark_import_batch_ready(current_setting('qa.race_register_batch')::uuid),true,'register race batch becomes ready');
select lives_ok(
  $$select public.withdraw_learner_subject_registration((select id from public.learner_subject_registrations where enrolment_id='fcd30000-0000-4000-8000-000000000001' and subject_offering_id='fcd50000-0000-4000-8000-000000000001'),'state changed after import review')$$,
  'authoritative registration may change after reconciliation preview'
);
select is(
  (public.commit_subject_registration_import_batch(current_setting('qa.race_register_batch')::uuid)->>'updated')::integer,
  1,
  'commit revalidates stale register skip and reactivates requested registration'
);
select is((select status from public.learner_subject_registrations where enrolment_id='fcd30000-0000-4000-8000-000000000001' and subject_offering_id='fcd50000-0000-4000-8000-000000000001'),'active','register import leaves authoritative state active despite post-review change');

select lives_ok(
  $$select public.withdraw_learner_subject_registration((select id from public.learner_subject_registrations where enrolment_id='fcd30000-0000-4000-8000-000000000001' and subject_offering_id='fcd50000-0000-4000-8000-000000000001'),'prepare withdraw race')$$,
  'control registration is withdrawn before withdraw preview'
);
select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','race-withdraw.csv',null)$$,
  'withdraw race batch can be created'
);
select set_config('qa.race_withdraw_batch',(select id::text from public.import_batches where source_file_name='race-withdraw.csv'),true);
select is(public.stage_import_rows(current_setting('qa.race_withdraw_batch')::uuid,'[{"row_number":2,"normalized":{"admission_number":"RACE-ADM","academic_year":2026,"subject_code":"RACE-SUB","action":"withdraw"}}]'::jsonb),1,'withdraw race row stages');
select is((public.reconcile_subject_registration_import_batch(current_setting('qa.race_withdraw_batch')::uuid)->>'skip')::integer,1,'withdraw row previews as skip while registration is withdrawn');
select is(public.mark_import_batch_ready(current_setting('qa.race_withdraw_batch')::uuid),true,'withdraw race batch becomes ready');
select lives_ok(
  $$select public.register_learner_subject('fcd30000-0000-4000-8000-000000000001','fcd50000-0000-4000-8000-000000000001','manual')$$,
  'registration can become active after withdraw reconciliation preview'
);
select is(
  (public.commit_subject_registration_import_batch(current_setting('qa.race_withdraw_batch')::uuid)->>'updated')::integer,
  1,
  'commit revalidates stale withdraw skip and applies requested withdrawal'
);
select is((select status from public.learner_subject_registrations where enrolment_id='fcd30000-0000-4000-8000-000000000001' and subject_offering_id='fcd50000-0000-4000-8000-000000000001'),'withdrawn','withdraw import leaves authoritative state withdrawn despite post-review change');

reset role;
select * from finish();
rollback;
