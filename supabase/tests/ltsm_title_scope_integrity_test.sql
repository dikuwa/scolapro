begin;

select plan(4);

insert into public.tenants(id,name,slug)
values('fd710000-0000-4000-8000-000000000001','LTSM Scope Tenant B','ltsm-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fd720000-0000-4000-8000-000000000001','fd710000-0000-4000-8000-000000000001','LTSM Scope School B','LTSM-SCOPE-B','Khomas','Windhoek'),
  ('fd720000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','LTSM Scope School A2','LTSM-SCOPE-A2','Khomas','Windhoek');

select throws_ok(
  $$insert into public.learning_resource_titles(tenant_id,school_id,resource_type,title,status)
    values('fd710000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','library_book','Bad tenant title','active')$$,
  'Learning resource title scope mismatch: school does not belong to tenant',
  'learning resource title tenant must match school tenant'
);

select lives_ok(
  $$insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
    values('fd730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','library_book','Valid scoped title','active')$$,
  'valid same-school learning resource title remains allowed'
);

select throws_ok(
  $$update public.learning_resource_titles
       set school_id='fd720000-0000-4000-8000-000000000002'
     where id='fd730000-0000-4000-8000-000000000001'$$,
  'Learning resource title tenant and school scope are immutable',
  'learning resource title cannot be moved across schools after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_learning_resource_title_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learning_resource_title_scope_integrity()','EXECUTE'),
  'LTSM title integrity trigger helper is not directly executable by client roles'
);

select * from finish();
rollback;
