begin;

select plan(12);

select has_table(
  'public',
  'academic_analysis_quality_symbols',
  'governed Academic Analysis quality-symbol registry exists'
);

select has_function(
  'public',
  'get_academic_analysis_promotion_readiness',
  array['uuid','integer'],
  'bulk canonical promotion-readiness RPC exists'
);

select is(
  has_function_privilege(
    'anon',
    'public.get_academic_analysis_promotion_readiness(uuid,integer)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot invoke promotion-readiness analysis'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_academic_analysis_promotion_readiness(uuid,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated callers can invoke the guarded readiness RPC'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='academic_analysis_quality_symbols'
      and policyname='academic_analysis_quality_symbols_select'
  ),
  'quality-symbol definitions are protected by school-scoped RLS'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.academic_analysis_quality_symbols'::regclass
      and tgname='academic_analysis_quality_symbol_guard_trg'
      and pg_get_triggerdef(oid) like '%DELETE%'
      and not tgisinternal
  )
  and not exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='academic_analysis_quality_symbols'
      and policyname='academic_analysis_quality_symbols_delete'
  ),
  'quality-symbol history cannot be physically deleted even by school-settings managers'
);

select ok(
  pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    like '%evaluate_promotion_recommendation_scoped_engine%',
  'readiness RPC delegates to the canonical promotion engine'
);

select ok(
  pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    like '%school_admin%principal%deputy_principal%'
  and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    not like '%''hod''%',
  'school-wide promotion readiness excludes HOD direct access and remains restricted to whole-school leaders'
);

select ok(
  pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    not like '%insert into public.official_results%'
    and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
      not like '%update public.official_results%',
  'Academic Analysis readiness remains read-only over canonical result state'
);

select ok(
  exists(
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='academic_analysis_quality_symbols'
      and column_name='effective_from_year'
  )
  and exists(
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='academic_analysis_quality_symbols'
      and column_name='effective_to_year'
  ),
  'quality-symbol definitions are effective-dated so historical analysis does not inherit current assumptions'
);

select ok(
  pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    like '%from public.academic_years ay%'
  and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    like '%e.enrolled_from<=v_year_end%'
  and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    like '%e.enrolled_to>=v_year_start%'
  and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    not like '%e.status=''current''%'
  and pg_get_functiondef('public.get_academic_analysis_promotion_readiness(uuid,integer)'::regprocedure)
    not like '%e.enrolled_from<=current_date%',
  'historical promotion readiness retains enrolments effective during the requested governed academic year'
);

select ok(
  pg_get_functiondef('app_private.guard_academic_analysis_quality_symbol()'::regprocedure)
    like '%new.created_by_user_id:=auth.uid()%'
  and exists(
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='academic_analysis_quality_symbols'
      and policyname='academic_analysis_quality_symbols_insert'
      and with_check like '%created_by_user_id%auth.uid()%'
  ),
  'quality-symbol authorship is bound to the authenticated caller at trigger and RLS boundaries'
);

select * from finish();
rollback;
