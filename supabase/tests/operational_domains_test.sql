begin;

select plan(24);

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

select ok((select relrowsecurity from pg_class where oid='public.learner_support_cases'::regclass),'learner support cases use RLS');
select ok((select relrowsecurity from pg_class where oid='public.examination_candidates'::regclass),'examination candidates use RLS');
select ok((select relrowsecurity from pg_class where oid='public.finance_payments'::regclass),'finance payments use RLS');
select ok((select relrowsecurity from pg_class where oid='public.tenant_features'::regclass),'tenant features use RLS');

select ok(to_regprocedure('public.refresh_examination_readiness(uuid)') is not null,'DNEA readiness refresh function exists');
select ok(not has_function_privilege('anon','public.refresh_examination_readiness(uuid)','EXECUTE'),'anonymous users cannot refresh DNEA readiness');
select ok(to_regprocedure('public.allocate_finance_payment(uuid,uuid,numeric)') is not null,'finance payment allocation function exists');
select ok(not has_function_privilege('anon','public.allocate_finance_payment(uuid,uuid,numeric)','EXECUTE'),'anonymous users cannot allocate payments');
select ok(to_regprocedure('public.set_tenant_feature(uuid,text,boolean,jsonb,date)') is not null,'tenant feature function exists');
select ok(not has_function_privilege('anon','public.set_tenant_feature(uuid,text,boolean,jsonb,date)','EXECUTE'),'anonymous users cannot change tenant features');
select ok(to_regprocedure('public.set_school_setting(uuid,text,jsonb)') is not null,'school setting function exists');

select * from finish();
rollback;