begin;

select plan(12);

select has_table('public','assessment_scheme_candidates','assessment scheme candidate lifecycle exists');
select has_column('public','assessment_schemes','curriculum_version_id','schemes bind curriculum version provenance');
select has_column('public','assessment_schemes','term_numbers','schemes declare term applicability');
select has_column('public','assessment_components','moderation_required','components carry moderation metadata');

select ok(
  pg_get_functiondef('public.extract_assessment_scheme_candidate(uuid)'::regprocedure)
    ilike '%No structured assessment configuration is available in this curriculum version%',
  'syllabus extraction fails closed when structured source metadata is absent'
);

select ok(
  pg_get_functiondef('public.publish_assessment_scheme_candidate(uuid)'::regprocedure)
    ilike '%Human verification is required before assessment scheme publication%',
  'publication requires a human-verified candidate'
);

select ok(
  pg_get_functiondef('public.publish_assessment_scheme_candidate(uuid)'::regprocedure)
    ilike '%status=''superseded''%',
  'publishing a new canonical version supersedes the prior active scheme key'
);

select ok(
  pg_get_functiondef('public.calculate_subject_result(uuid,uuid,smallint)'::regprocedure)
    ilike '%p_term_number = any(v_scheme.term_numbers)%'
  and pg_get_functiondef('public.calculate_subject_result(uuid,uuid,smallint)'::regprocedure)
    ilike '%p_term_number = any(ac.term_numbers)%',
  'result calculation honors both scheme and component term applicability'
);

select ok(
  app_private.valid_three_term_array(array[1,2,3]::smallint[]),
  'three-term configuration accepts terms 1 to 3'
);

select ok(
  not app_private.valid_three_term_array(array[1,4]::smallint[]),
  'term configuration rejects values outside Namibia three-term support'
);

select ok(
  not app_private.valid_three_term_array(array[1,1]::smallint[]),
  'term configuration rejects duplicate terms'
);

select ok(
  pg_get_functiondef('app_private.enforce_assessment_scheme_curriculum_binding()'::regprocedure)
    ilike '%subject/grade/version provenance is immutable%',
  'published assessment scheme provenance cannot silently change'
);

select * from finish();
rollback;
