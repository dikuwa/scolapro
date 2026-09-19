begin;

select plan(10);

select has_column(
  'public',
  'subject_department_responsibilities',
  'department_label',
  'HOD subject responsibilities expose an optional descriptive portfolio label'
);

select has_function(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'grouped HOD portfolio save exists with a typed subject array'
);

select function_privs_are(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can invoke the governed portfolio save'
);

select function_privs_are(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'anon',
  array[]::text[],
  'anonymous users cannot invoke the portfolio save'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%subject_department_responsibilities%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%p_subject_ids%',
  'portfolio save writes the canonical subject responsibility rows'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%user_current_school_matches%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%has_school_role%',
  'portfolio save requires current-school leadership authority'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) not ilike '%platform_support%',
  'Platform Support is not granted portfolio configuration authority'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%tenant_id%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%school_id%',
  'portfolio save verifies tenant and school scope'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%on conflict%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%effective_to = excluded.effective_to%',
  'grouped save is idempotent for an existing effective responsibility'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid = 'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
      and prosecdef
  ),
  'portfolio save does not bypass RLS with security definer'
);

select * from finish();
rollback;