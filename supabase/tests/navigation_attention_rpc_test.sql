begin;

select plan(11);

select ok(
  to_regprocedure('public.get_my_navigation_attention(date)') is not null,
  'navigation attention RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  false,
  'navigation attention RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'search_path=pg_catalog',
  'navigation attention RPC pins pg_catalog search_path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'p_as_of_date date',
  'navigation attention RPC accepts only as-of date'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.get_my_user_context(p_as_of_date)%'
      and pg_get_functiondef(p.oid) not like '%p_school_id%'
      and pg_get_functiondef(p.oid) not like '%p_user_id%'
      and pg_get_functiondef(p.oid) not like '%p_role%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'navigation attention derives caller context from self-scoped user context'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%school_memberships -> 0 ->> ''school_id''%'
      and pg_get_functiondef(p.oid) like '%jsonb_array_length(context_row.platform_memberships) = 0%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'navigation attention preserves current-school selection and platform suppression'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%when ''school_admin'' then 1%'
      and pg_get_functiondef(p.oid) like '%when ''principal'' then 2%'
      and pg_get_functiondef(p.oid) like '%when ''deputy_principal'' then 3%'
      and pg_get_functiondef(p.oid) like '%when ''hod'' then 4%'
      and pg_get_functiondef(p.oid) like '%when ''counsellor'' then 5%'
      and pg_get_functiondef(p.oid) like '%when ''learner'' then 15%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'navigation attention preserves school-role priority'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.profile_change_requests%'
      and pg_get_functiondef(p.oid) like '%request.status = ''pending''%'
      and pg_get_functiondef(p.oid) like '%''school_admin''%'
      and pg_get_functiondef(p.oid) like '%''counsellor''%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_navigation_attention'
  ),
  'navigation attention preserves data-correction source and reviewer roles'
);

select ok(
  has_function_privilege('authenticated','public.get_my_navigation_attention(date)','EXECUTE'),
  'authenticated can execute navigation attention RPC'
);

select ok(
  not has_function_privilege('anon','public.get_my_navigation_attention(date)','EXECUTE'),
  'anon cannot execute navigation attention RPC'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_my_navigation_attention'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;