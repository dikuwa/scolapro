begin;

select plan(13);

select ok(
  to_regprocedure('app_private.get_sports_house_assignment_years_authorized(uuid)') is not null,
  'private assignment-year helper exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_assignment_years_authorized'
  ),
  true,
  'private assignment-year helper is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_assignment_years_authorized'
  ),
  'search_path=""',
  'private assignment-year helper pins an empty search_path'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  false,
  'public assignment-year RPC remains SECURITY INVOKER'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%auth.uid() is null%'
      and pg_get_functiondef(p.oid) like '%app_private.has_school_access(p_school_id)%'
      and pg_get_functiondef(p.oid) like '%app_private.has_platform_role(array[''platform_admin'']::text[])%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_assignment_years_authorized'
  ),
  'private helper explicitly authenticates and authorizes the requested school'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.sports_learner_house_assignments%'
      and pg_get_functiondef(p.oid) like '%public.sports_staff_house_assignments%'
      and pg_get_functiondef(p.oid) like '%select distinct years.academic_year%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_assignment_years_authorized'
  ),
  'private helper preserves learner plus staff distinct-year aggregation'
);

select ok(
  has_function_privilege('authenticated','app_private.get_sports_house_assignment_years_authorized(uuid)','EXECUTE'),
  'authenticated can execute private helper through the non-exposed schema'
);

select ok(
  not has_function_privilege('anon','app_private.get_sports_house_assignment_years_authorized(uuid)','EXECUTE'),
  'anon cannot execute private helper'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_assignment_years(uuid)','EXECUTE'),
  'anon cannot execute public assignment-year RPC'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('94500000-0000-4000-8000-000000000001','sports-years-auth@example.test','authenticated','authenticated',now(),now());

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','94500000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select * from public.get_sports_house_assignment_years('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'P0001',
  'Permission denied',
  'authenticated user without school authority cannot read assignment years'
);

reset role;

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','94500000-0000-4000-8000-000000000001','teacher',current_date-1);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','94500000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select * from public.get_sports_house_assignment_years('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'authorized school member can read assignment years'
);

reset role;

select ok(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_sports_house_assignment_years'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ) = 0,
  'PUBLIC has no execute grant on public assignment-year RPC'
);

select ok(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='app_private'
      and routine_name='get_sports_house_assignment_years_authorized'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ) = 0,
  'PUBLIC has no execute grant on private assignment-year helper'
);

select * from finish();
rollback;