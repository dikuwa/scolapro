begin;

select plan(16);

select has_function(
  'public',
  'get_sports_house_operational_learner_roster_v2',
  array['uuid','integer'],
  'versioned DOB-aware Sports/Houses roster RPC exists'
);

select ok(
  pg_get_function_result('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    not ilike '%date_of_birth%',
  'default learner roster result does not expose raw DOB'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%security definer%'
    and pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%Authentication required%',
  'versioned roster remains an authenticated security-definer read'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%has_platform_role(array[''platform_support''])%Permission denied%',
  'Platform Support remains denied'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%can_read_learner_identity(p_school_id,e.learner_id)%',
  'roster keeps the canonical per-learner identity authorization check'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%e.school_id=p_school_id%'
    and pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%e.academic_year=p_academic_year%'
    and pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%l.tenant_id=e.tenant_id%',
  'roster remains scoped to the requested school/year and learner tenant'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%status in (''current'',''completed'',''transferred'')%',
  'eligible enrolment statuses are unchanged'
);

select function_privs_are(
  'public',
  'get_sports_house_operational_learner_roster_v2',
  array['uuid','integer'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can invoke the scoped roster RPC'
);

select is(
  has_function_privilege('anon','public.get_sports_house_operational_learner_roster_v2(uuid,integer)','EXECUTE'),
  false,
  'anonymous users cannot invoke the guarded roster RPC'
);

select ok(
  pg_get_function_result('public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean)'::regprocedure)
    ilike '%date_of_birth date%'
    and pg_get_functiondef('public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean)'::regprocedure)
      ilike '%p_include_date_of_birth is not true%'
    and pg_get_functiondef('public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean)'::regprocedure)
      ilike '%can_read_learner_identity(p_school_id,e.learner_id)%',
  'DOB is exposed only through the explicit export RPC and canonical per-learner identity gate'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%ys.age_reference_date is not null%'
    and pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%else null%',
  'missing DOB or school/year reference date leaves age unresolved'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%l.date_of_birth <= ys.age_reference_date%',
  'future DOB is excluded from both age and age-group calculations'
);

select is(
  extract(year from age(date '2026-06-30',date '2010-06-30'))::integer,
  16,
  'age is inclusive on the configured birthday'
);

select is(
  extract(year from age(date '2026-06-30',date '2010-07-01'))::integer,
  15,
  'age before the configured birthday remains the prior completed age'
);

select ok(
  pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%>=sag.min_age%'
    and pg_get_functiondef('public.get_sports_house_operational_learner_roster_v2(uuid,integer)'::regprocedure)
    ilike '%<=sag.max_age%',
  'existing school-defined inclusive minimum and maximum age rules are preserved'
);

select has_function(
  'public',
  'get_sports_house_operational_learner_roster',
  array['uuid','integer'],
  'original RPC remains available for compatibility'
);

select * from finish();
rollback;
