begin;

select plan(28);

select has_table('public','grading_scales','grading scales exist');
select has_table('public','grading_scale_bands','grading bands exist');
select has_table('public','promotion_rule_sets','promotion rule sets exist');
select has_table('public','promotion_rule_conditions','promotion rule conditions exist');
select has_table('public','curriculum_sources','curriculum sources exist');
select has_table('public','curriculum_subjects','curriculum subjects exist');
select has_table('public','curriculum_versions','curriculum versions exist');
select has_table('public','curriculum_units','curriculum units exist');
select has_table('public','curriculum_objectives','curriculum objectives exist');
select has_table('public','curriculum_competencies','curriculum competencies exist');
select has_table('public','pacing_plans','pacing plans exist');
select has_table('public','pacing_plan_items','pacing plan items exist');
select has_table('public','teaching_schedule_items','teaching schedule items exist');
select has_table('public','lesson_preparations','lesson preparations exist');
select has_table('public','teaching_actuals','teaching actuals exist');

select ok((select relrowsecurity from pg_class where oid='public.grading_scales'::regclass),'grading scales use RLS');
select ok((select relrowsecurity from pg_class where oid='public.promotion_rule_sets'::regclass),'promotion rules use RLS');
select ok((select relrowsecurity from pg_class where oid='public.curriculum_versions'::regclass),'curriculum versions use RLS');
select ok((select relrowsecurity from pg_class where oid='public.lesson_preparations'::regclass),'lesson preparations use RLS');

select ok(to_regprocedure('public.calculate_subject_result(uuid,uuid,smallint)') is not null,'subject result calculation exists');
select ok(to_regprocedure('public.submit_assessment_for_review(uuid,text)') is not null,'assessment submission function exists');
select ok(to_regprocedure('public.review_mark_submission(uuid,text,text)') is not null,'mark review function exists');
select ok(to_regprocedure('public.approve_official_subject_result(uuid,uuid,smallint,uuid)') is not null,'official result approval function exists');
select ok(to_regprocedure('public.evaluate_promotion_recommendation(uuid,uuid)') is not null,'promotion evaluator exists');
select ok(to_regprocedure('public.generate_year_end_progression(uuid,uuid)') is not null,'progression generator exists');
select ok(to_regprocedure('public.build_school_operational_snapshot(uuid,integer,date)') is not null,'operational statutory source generator exists');
select ok(to_regprocedure('public.generate_statutory_snapshot(uuid)') is not null,'statutory snapshot generator exists');
select ok(not has_function_privilege('anon','public.approve_official_subject_result(uuid,uuid,smallint,uuid)','EXECUTE'),'anonymous users cannot approve official results');

select * from finish();
rollback;