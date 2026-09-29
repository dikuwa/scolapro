begin;

select plan(15);

select has_table('public','operational_file_resources','operational resource table exists');
select has_table('public','operational_file_resource_bindings','resource binding table exists');

select ok(
  (select relrowsecurity from pg_class where oid='public.operational_file_resources'::regclass),
  'operational resources have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.operational_file_resource_bindings'::regclass),
  'resource bindings have RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='operational_file_resources' and cmd='SELECT'),
  1,
  'resources expose one governed SELECT policy'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='operational_file_resource_bindings' and cmd='SELECT'),
  1,
  'bindings expose one governed SELECT policy'
);

select ok(
  pg_get_functiondef('app_private.can_read_operational_file_resource(uuid)'::regprocedure)
    ilike '%user_current_school_matches%',
  'resource read helper is current-school bounded'
);

select ok(
  pg_get_functiondef('app_private.can_read_operational_file_resource(uuid)'::regprocedure)
    ilike '%hod_responsible_for_subject%',
  'subject resource reads reuse governed HOD subject authority'
);

select ok(
  pg_get_functiondef('app_private.can_read_operational_file_resource(uuid)'::regprocedure)
    ilike '%teacher_allocations%',
  'subject resources can resolve through active teacher allocations'
);

select ok(
  pg_get_functiondef('app_private.user_owns_operational_file_resource(uuid,uuid,uuid)'::regprocedure)
    ilike '%platform_admin%platform_support%',
  'teacher-private scope excludes platform administrative/support sessions'
);

select ok(
  pg_get_functiondef('public.create_operational_file_resource(text,uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,date,date,uuid[])'::regprocedure)
    ilike '%External operational resource URL must use HTTPS%',
  'resource creation enforces HTTPS external references'
);

select ok(
  pg_get_functiondef('public.create_operational_file_resource(text,uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,date,date,uuid[])'::regprocedure)
    ilike '%Operational resource management authority required%',
  'resource creation checks scope-specific authority'
);

select ok(
  pg_get_functiondef('app_private.preserve_operational_file_resource_provenance()'::regprocedure)
    ilike '%archive and create a replacement%',
  'resource identity/provenance is append/archive rather than editable'
);

select ok(
  not has_table_privilege('authenticated','public.operational_file_resources','INSERT')
  and not has_table_privilege('authenticated','public.operational_file_resources','UPDATE')
  and not has_table_privilege('authenticated','public.operational_file_resources','DELETE'),
  'authenticated clients have no direct resource mutation privileges'
);

select ok(
  not has_table_privilege('authenticated','public.operational_file_resource_bindings','INSERT')
  and not has_table_privilege('authenticated','public.operational_file_resource_bindings','UPDATE')
  and not has_table_privilege('authenticated','public.operational_file_resource_bindings','DELETE'),
  'authenticated clients have no direct binding mutation privileges'
);

select * from finish();
rollback;
