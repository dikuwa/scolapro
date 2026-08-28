begin;

select plan(50);

select has_table('public','conduct_events','conduct events exist');
select has_table('public','learner_support_cases','learner support cases exist');
select has_table('public','learning_resource_copies','learning resource copies exist');
select has_table('public','communication_messages','communication messages exist');
select has_table('public','admission_applications','admission applications exist');
select has_table('public','transfer_events','transfer events exist');
select has_table('public','year_end_progressions','year-end progressions exist');
select has_table('public','examination_candidates','examination candidates exist');
select has_table('public','examination_readiness_issues','examination readiness issues exist');
select has_table('public','finance_invoices','finance invoices exist');
select has_table('public','finance_payments','finance payments exist');
select has_table('public','tenant_features','tenant features exist');
select has_table('public','school_settings','school settings exist');
select has_table('public','guardian_profiles','guardian profiles exist');
select has_table('public','learner_guardians','learner guardian relationships exist');
select has_table('public','guardian_contacts','guardian contacts exist');
select has_table('public','guardian_user_links','guardian user links exist');
select has_table('public','import_batches','import batches exist');
select has_table('public','import_rows','import staging rows exist');
select has_table('public','subject_attendance_submissions','subject attendance submissions exist');
select has_table('public','school_late_arrival_events','school late arrival events exist');
select has_table('public','late_detention_obligations','late detention obligations exist');

select ok((select relrowsecurity from pg_class where oid='public.learner_support_cases'::regclass),'learner support cases use RLS');
select ok((select relrowsecurity from pg_class where oid='public.examination_candidates'::regclass),'examination candidates use RLS');
select ok((select relrowsecurity from pg_class where oid='public.finance_payments'::regclass),'finance payments use RLS');
select ok((select relrowsecurity from pg_class where oid='public.tenant_features'::regclass),'tenant features use RLS');
select ok((select relrowsecurity from pg_class where oid='public.guardian_profiles'::regclass),'guardian profiles use RLS');
select ok((select relrowsecurity from pg_class where oid='public.import_batches'::regclass),'import batches use RLS');
select ok((select relrowsecurity from pg_class where oid='public.subject_attendance_submissions'::regclass),'subject attendance submissions use RLS');

select ok(to_regprocedure('public.refresh_examination_readiness(uuid)') is not null,'DNEA readiness refresh function exists');
select ok(not has_function_privilege('anon','public.refresh_examination_readiness(uuid)','EXECUTE'),'anonymous users cannot refresh DNEA readiness');
select ok(to_regprocedure('public.allocate_finance_payment(uuid,uuid,numeric)') is not null,'finance payment allocation function exists');
select ok(not has_function_privilege('anon','public.allocate_finance_payment(uuid,uuid,numeric)','EXECUTE'),'anonymous users cannot allocate payments');
select ok(to_regprocedure('public.set_tenant_feature(uuid,text,boolean,jsonb,date)') is not null,'tenant feature function exists');
select ok(not has_function_privilege('anon','public.set_tenant_feature(uuid,text,boolean,jsonb,date)','EXECUTE'),'anonymous users cannot change tenant features');
select ok(to_regprocedure('public.set_school_setting(uuid,text,jsonb)') is not null,'school setting function exists');
select ok(to_regprocedure('public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb)') is not null,'guardian relationship upsert function exists');
select ok(not has_function_privilege('anon','public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb)','EXECUTE'),'anonymous users cannot manage guardian relationships');
select ok(to_regprocedure('public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint)') is not null,'existing guardian sibling-link function exists');
select ok(not has_function_privilege('anon','public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint)','EXECUTE'),'anonymous users cannot link existing guardians');
select ok(to_regprocedure('public.claim_guardian_profile(uuid)') is not null,'guardian account claim function exists');
select ok(not has_function_privilege('anon','public.claim_guardian_profile(uuid)','EXECUTE'),'anonymous users cannot claim guardian profiles');
select ok(to_regprocedure('public.create_import_batch(uuid,text,text,text)') is not null,'import batch creation function exists');
select ok(not has_function_privilege('anon','public.create_import_batch(uuid,text,text,text)','EXECUTE'),'anonymous users cannot create import batches');
select ok(to_regprocedure('public.commit_learner_import_batch(uuid)') is not null,'atomic learner import commit function exists');
select ok(not has_function_privilege('anon','public.commit_learner_import_batch(uuid)','EXECUTE'),'anonymous users cannot commit learner imports');
select ok(to_regprocedure('public.submit_subject_period_attendance(uuid,date,jsonb,text,uuid,uuid,text)') is not null,'subject-period attendance submission function exists');
select ok(not has_function_privilege('anon','public.submit_subject_period_attendance(uuid,date,jsonb,text,uuid,uuid,text)','EXECUTE'),'anonymous users cannot submit subject-period attendance');
select ok(to_regprocedure('public.assign_school_duty(uuid,uuid,text,date,date)') is not null,'school duty assignment function exists');
select ok(not has_function_privilege('anon','public.assign_school_duty(uuid,uuid,text,date,date)','EXECUTE'),'anonymous users cannot assign school duties');

select * from finish();
rollback;