begin;

select plan(31);

select has_table('public','assessment_schemes','assessment schemes exist');
select has_table('public','assessment_instances','assessment instances exist');
select has_table('public','learner_marks','learner marks exist');
select has_table('public','mark_submissions','mark submissions exist');
select has_table('public','official_results','official results exist');
select has_table('public','report_card_snapshots','report card snapshots exist');
select has_table('public','statutory_form_definitions','statutory form definitions exist');
select has_table('public','statutory_reporting_cycles','statutory reporting cycles exist');
select has_table('public','statutory_snapshots','statutory snapshots exist');
select has_table('public','statutory_certifications','statutory certifications exist');
select has_table('public','statutory_mapping_runs','statutory mapping runs exist');

select ok((select relrowsecurity from pg_class where oid='public.learner_marks'::regclass),'learner marks use RLS');
select ok((select relrowsecurity from pg_class where oid='public.official_results'::regclass),'official results use RLS');
select ok((select relrowsecurity from pg_class where oid='public.report_card_snapshots'::regclass),'report card snapshots use RLS');
select ok((select relrowsecurity from pg_class where oid='public.statutory_snapshots'::regclass),'statutory snapshots use RLS');
select ok((select relrowsecurity from pg_class where oid='public.statutory_mapping_runs'::regclass),'statutory mapping runs use RLS');

select ok(to_regprocedure('app_private.can_access_assessment_instance(uuid)') is not null,'assessment scope helper exists');
select ok(to_regclass('public.learner_marks_current') is not null,'current learner marks view exists');
select ok(to_regprocedure('public.build_report_card_snapshot(uuid,smallint,text)') is not null,'report card snapshot builder exists');
select ok(to_regprocedure('public.certify_report_card_snapshot(uuid)') is not null,'report card certification function exists');
select ok(not has_function_privilege('anon','public.certify_report_card_snapshot(uuid)','EXECUTE'),'anonymous users cannot certify report cards');
select ok(to_regprocedure('public.publish_report_card_snapshot(uuid)') is not null,'report card publication function exists');
select ok(not has_function_privilege('anon','public.publish_report_card_snapshot(uuid)','EXECUTE'),'anonymous users cannot publish report cards');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='report_card_snapshots' and policyname='scoped users read report card snapshots'),'staff and guardian report reads use one scoped consolidated policy');
select ok(to_regprocedure('public.certify_statutory_snapshot(uuid,text,text)') is not null,'statutory certification function exists');
select ok(not has_function_privilege('anon','public.certify_statutory_snapshot(uuid,text,text)','EXECUTE'),'anonymous users cannot certify statutory snapshots');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='learner_marks' and policyname='scoped academic staff can append learner marks'),'teacher mark write policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='statutory_certifications' and policyname='school leaders can create statutory certifications'),'statutory certification policy exists');
select ok(to_regprocedure('public.validate_statutory_mapping_schema(jsonb)') is not null,'generic statutory mapping schema validator exists');
select ok(to_regprocedure('public.compile_statutory_mapping(uuid)') is not null,'generic statutory mapping compiler exists');
select ok(not has_function_privilege('anon','public.compile_statutory_mapping(uuid)','EXECUTE'),'anonymous users cannot compile statutory mappings');

select * from finish();
rollback;