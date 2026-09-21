begin;

select plan(12);

-- The contract is intentionally structural so it can run with the normal
-- repository fixtures without creating a second learner-directory model.
select has_function(
  'public',
  'get_sports_house_learner_roster',
  array['uuid','integer'],
  'Sports workspace uses one governed school/year roster function'
);
select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%security definer%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%Authentication required%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%Permission denied%',
  'roster function is a governed security-definer read'
);
select function_privs_are(
  'public',
  'get_sports_house_learner_roster',
  array['uuid','integer'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users receive only execute access'
);
select function_privs_are(
  'public',
  'get_sports_house_learner_roster',
  array['uuid','integer'],
  'anon',
  array[]::text[],
  'anonymous users cannot call the roster function'
);
select is(
  (select prosrc like '%current%completed%transferred%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_sports_house_learner_roster'),
  true,
  'roster includes the existing current/completed/transferred eligibility statuses'
);
select is(
  (select prosrc like '%platform_support%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_sports_house_learner_roster'),
  true,
  'Platform Support remains denied by the Sports / Houses read contract'
);
select is(
  (select prosrc like '%admission_number%' and prosrc like '%sports_learner_house_assignments%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_sports_house_learner_roster'),
  true,
  'one read returns admission numbers and assignment continuity for assigned and unassigned learners'
);

select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%school_admin%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%principal%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%deputy_principal%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%hod%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%teacher%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%class_teacher%',
  'Sports / Houses reader roles remain explicit in the governed roster contract'
);
select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%e.school_id=p_school_id%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%e.academic_year=p_academic_year%',
  'roster is bounded to the requested school and academic year'
);
select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%l.tenant_id=e.tenant_id%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%e.tenant_id%',
  'learner identity hydration stays tenant-bound to the school enrolment'
);
select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%left join public.sports_learner_house_assignments%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%coalesce(a.is_locked,false)%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%a.assignment_source%',
  'assigned, locked and unassigned learner states remain in one read'
);
select ok(
  pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%platform_admin%'
  and pg_get_functiondef('public.get_sports_house_learner_roster(uuid,integer)'::regprocedure) ilike '%has_platform_role%',
  'governed Platform Admin access remains available without widening school roles'
);
select * from finish();
rollback;
