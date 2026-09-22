begin;

select plan(4);

select has_function(
  'public',
  'search_guardian_directory_page_current_enrolment_impl',
  array['uuid','text','integer','integer'],
  'guardian directory page implementation exists'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%actor_scope as materialized%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%schoolwide%',
  'school-wide guardian authority is resolved once'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%can_access_learner_observations%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%where not actor.schoolwide%',
  'learner-scoped authority remains as the non-schoolwide fallback'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%school_admin%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%hod%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%has_platform_role%',
  'existing school-wide role semantics are preserved'
);

select * from finish();
rollback;
