begin;

select plan(7);

insert into auth.users(id,email,created_at,updated_at)
values ('ed100000-0000-4000-8000-000000000001','statutory-scope@example.test',now(),now());

insert into public.tenants(id,name,slug)
values ('ed110000-0000-4000-8000-000000000001','Statutory Scope Tenant B','statutory-scope-tenant-b');

insert into public.statutory_form_definitions(id,form_key,display_name,authority)
values ('ed120000-0000-4000-8000-000000000001','SCOPE_FORM','Scope Form','MOEAC');

insert into public.statutory_form_versions(id,form_definition_id,version_key,effective_from,status)
values
  ('ed130000-0000-4000-8000-000000000001','ed120000-0000-4000-8000-000000000001','v1','2026-01-01','published'),
  ('ed130000-0000-4000-8000-000000000002','ed120000-0000-4000-8000-000000000001','v2','2026-01-01','published');

select throws_ok(
  $$insert into public.statutory_reporting_cycles(tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,created_by_user_id)
    values('ed110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ed130000-0000-4000-8000-000000000001',2026,'SCOPE-INVALID','2026-03-31','ed100000-0000-4000-8000-000000000001')$$,
  'Statutory reporting cycle scope mismatch: school does not belong to tenant',
  'statutory reporting cycle tenant must match school tenant'
);

select lives_ok(
  $$insert into public.statutory_reporting_cycles(id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,created_by_user_id)
    values('ed140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed130000-0000-4000-8000-000000000001',2026,'SCOPE-VALID','2026-03-31','ed100000-0000-4000-8000-000000000001')$$,
  'valid statutory reporting cycle remains allowed'
);

select lives_ok(
  $$update public.statutory_reporting_cycles set status='review',due_on='2026-04-30' where id='ed140000-0000-4000-8000-000000000001'$$,
  'statutory reporting lifecycle fields remain mutable'
);

insert into public.statutory_snapshots(id,tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id)
values ('ed150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed140000-0000-4000-8000-000000000001',1,'{}'::jsonb,'{}'::jsonb,'ed100000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.statutory_mapping_runs(tenant_id,school_id,reporting_cycle_id,snapshot_id,form_version_id,mapping_schema_snapshot,compiled_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed140000-0000-4000-8000-000000000001','ed150000-0000-4000-8000-000000000001','ed130000-0000-4000-8000-000000000002','{}'::jsonb,'ed100000-0000-4000-8000-000000000001')$$,
  'Statutory mapping run scope mismatch: reporting cycle does not match run scope and form version',
  'mapping run form version must match reporting cycle form version'
);

select lives_ok(
  $$insert into public.statutory_mapping_runs(id,tenant_id,school_id,reporting_cycle_id,snapshot_id,form_version_id,mapping_schema_snapshot,compiled_by_user_id)
    values('ed160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed140000-0000-4000-8000-000000000001','ed150000-0000-4000-8000-000000000001','ed130000-0000-4000-8000-000000000001','{}'::jsonb,'ed100000-0000-4000-8000-000000000001')$$,
  'valid statutory mapping run remains allowed'
);

select throws_ok(
  $$update public.statutory_mapping_runs set form_version_id='ed130000-0000-4000-8000-000000000002' where id='ed160000-0000-4000-8000-000000000001'$$,
  'Statutory mapping run scope, snapshot, and form version are immutable',
  'mapping run provenance cannot be rewritten after compilation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_statutory_reporting_cycle_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_statutory_reporting_cycle_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_statutory_mapping_run_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_statutory_mapping_run_scope_integrity()','EXECUTE'),
  'statutory integrity helpers are private from client roles'
);

select * from finish();
rollback;