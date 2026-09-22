begin;

select plan(6);

select has_function(
  'public',
  'search_guardian_directory_page_current_enrolment_impl',
  array['uuid','text','integer','integer'],
  'paged guardian directory implementation remains present'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%actor_scope as materialized%',
  'existing schoolwide/scoped authorization foundation remains'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%can_access_learner_observations%',
  'non-schoolwide users retain learner-scoped authorization'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%paged as materialized%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%count(*) over()%',
  'directory computes total and page before contact hydration'
);

select ok(
  strpos(
    pg_get_functiondef(
      to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
    ),
    'paged as materialized'
  ) <
  strpos(
    pg_get_functiondef(
      to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
    ),
    'as primary_mobile'
  ),
  'primary contact projection occurs after pagination'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%p_page_size%'
  and pg_get_functiondef(
    to_regprocedure('public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)')
  ) ilike '%greatest(coalesce(p_page,1),1)-1%',
  'page size and offset remain bounded'
);

select * from finish();
rollback;
