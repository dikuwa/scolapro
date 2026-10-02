begin;

select plan(10);

select ok(
  to_regprocedure('public.get_learner_subject_registration_counts(uuid,integer)') is not null,
  'learner subject registration count RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  true,
  'learner subject registration count RPC is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  'search_path=pg_catalog, public, app_private',
  'learner subject registration count RPC pins its trusted search path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  'p_school_id uuid, p_academic_year integer',
  'learner subject registration count RPC accepts only school and year'
);

select ok(
  (
    select lower(pg_get_functiondef(p.oid)) like '%app_private.can_manage_learner_subject_registrations(p_school_id)%'
      and lower(pg_get_functiondef(p.oid)) like '%if auth.uid() is null%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  'learner subject registration count RPC requires authentication and canonical management authority once'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%can_read_learner_subject_registration%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  'learner subject registration count RPC does not repeat learner-level authorization per registration'
);

select ok(
  (
    select lower(pg_get_functiondef(p.oid)) like '%public.learner_subject_registrations%'
      and lower(pg_get_functiondef(p.oid)) like '%group by lsr.subject_offering_id%'
      and lower(pg_get_functiondef(p.oid)) like '%lsr.status = ''active''%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_learner_subject_registration_counts'
  ),
  'learner subject registration count RPC groups active registration rows'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_learner_subject_registration_counts(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated can execute learner subject registration count RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_learner_subject_registration_counts(uuid,integer)',
    'EXECUTE'
  ),
  'anon cannot execute learner subject registration count RPC'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_learner_subject_registration_counts'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;
