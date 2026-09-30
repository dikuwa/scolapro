begin;

select plan(8);

select has_function(
  'public',
  'assign_learners_sports_house',
  array['uuid','integer','uuid[]','uuid','text','boolean']::text[],
  'bounded import uses the governed learner batch assignment RPC'
);

select has_function(
  'public',
  'assign_staff_sports_house',
  array['uuid','integer','uuid','uuid','text','text','boolean']::text[],
  'bounded import uses the governed staff assignment RPC'
);

select has_function(
  'public',
  'upsert_sports_house',
  array['uuid','text','text','text','integer','uuid']::text[],
  'bounded import uses the governed house configuration RPC'
);

select ok(
  position('p_assignment_source' in pg_get_functiondef(
    to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)')
  )) > 0
  and position('p_is_locked' in pg_get_functiondef(
    to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)')
  )) > 0,
  'learner batch RPC accepts explicit provenance and lock state'
);

select ok(
  position('Locked learner assignment cannot be moved' in pg_get_functiondef(
    to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)')
  )) > 0,
  'learner batch RPC preserves locked-assignment movement protection'
);

select ok(
  exists(
    select 1
    from pg_constraint c
    where c.conrelid='public.sports_learner_house_assignments'::regclass
      and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%import%'
  ),
  'canonical learner assignment store permits import provenance'
);

select ok(
  exists(
    select 1
    from pg_constraint c
    where c.conrelid='public.sports_staff_house_assignments'::regclass
      and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%import%'
  ),
  'canonical staff assignment store permits import provenance'
);

select ok(
  position('app_private.can_manage_sports(p_school_id)' in pg_get_functiondef(
    to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)')
  )) > 0
  and position('app_private.can_manage_sports(p_school_id)' in pg_get_functiondef(
    to_regprocedure('public.assign_staff_sports_house(uuid,integer,uuid,uuid,text,text,boolean)')
  )) > 0,
  'governed learner/staff assignment RPCs retain school-management authority checks'
);

select * from finish();
rollback;
