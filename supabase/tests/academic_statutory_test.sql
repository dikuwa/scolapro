begin;

select plan(18);

select has_table('public','assessment_schemes','assessment schemes exist');
select has_table('public','assessment_instances','assessment instances exist');
select has_table('public','learner_marks','learner marks exist');
select has_table('public','mark_submissions','mark submissions exist');
select has_table('public','official_results','official results exist');
select has_table('public','statutory_form_definitions','statutory form definitions exist');
select has_table('public','statutory_reporting_cycles','statutory reporting cycles exist');
select has_table('public','statutory_snapshots','statutory snapshots exist');
select has_table('public','statutory_certifications','statutory certifications exist');

select ok((select relrowsecurity from pg_class where oid='public.learner_marks'::regclass),'learner marks use RLS');
select ok((select relrowsecurity from pg_class where oid='public.official_results'::regclass),'official results use RLS');
select ok((select relrowsecurity from pg_class where oid='public.statutory_snapshots'::regclass),'statutory snapshots use RLS');

select ok(to_regprocedure('app_private.can_access_assessment_instance(uuid)') is not null,'assessment scope helper exists');
select ok(to_regclass('public.learner_marks_current') is not null,'current learner marks view exists');
select ok(to_regprocedure('public.certify_statutory_snapshot(uuid,text,text)') is not null,'statutory certification function exists');
select ok(not has_function_privilege('anon','public.certify_statutory_snapshot(uuid,text,text)','EXECUTE'),'anonymous users cannot certify statutory snapshots');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='learner_marks' and policyname='scoped academic staff can append learner marks'),'teacher mark write policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='statutory_certifications' and policyname='school leaders can create statutory certifications'),'statutory certification policy exists');

select * from finish();
rollback;