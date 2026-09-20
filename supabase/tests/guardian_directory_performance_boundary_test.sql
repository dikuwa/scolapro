begin;

select plan(4);

select ok(
  has_function_privilege('authenticated','public.search_guardian_directory(uuid,text,integer)','EXECUTE'),
  'authenticated users retain access to the governed guardian-directory wrapper'
);

select ok(
  not has_function_privilege('authenticated','public.search_guardian_directory_current_enrolment_impl(uuid,text,integer)','EXECUTE')
  and not has_function_privilege('anon','public.search_guardian_directory_current_enrolment_impl(uuid,text,integer)','EXECUTE')
  and not has_function_privilege('public','public.search_guardian_directory_current_enrolment_impl(uuid,text,integer)','EXECUTE'),
  'optimized guardian-directory implementation remains private from client roles'
);

select is(
  (select prosecdef
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='search_guardian_directory_current_enrolment_impl'
     and pg_get_function_identity_arguments(p.oid)='p_school_id uuid, p_query text, p_limit integer'),
  true,
  'optimized guardian-directory implementation remains SECURITY DEFINER'
);

select is(
  (select array_to_string(proconfig,',')
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='search_guardian_directory_current_enrolment_impl'
     and pg_get_function_identity_arguments(p.oid)='p_school_id uuid, p_query text, p_limit integer'),
  'search_path=public, app_private',
  'optimized guardian-directory implementation keeps an explicit search path'
);

select * from finish();
rollback;
