begin;

select plan(7);

insert into public.tenants(id,name,slug)
values('ae800000-0000-4000-8000-000000000001','Finance Charge Scope Tenant B','finance-charge-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ae810000-0000-4000-8000-000000000001','ae800000-0000-4000-8000-000000000001','Finance Charge Scope School B','FCS-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.finance_charge_types(tenant_id,school_id,charge_code,display_name)
    values('ae800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','BAD-SCOPE','Bad scope')$$,
  'Finance charge type scope mismatch: school does not belong to tenant',
  'finance charge type tenant must match school tenant'
);

select lives_ok(
  $$insert into public.finance_charge_types(id,tenant_id,school_id,charge_code,display_name,default_amount)
    values('ae820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SCOPE-FEE','Scope Fee',100)$$,
  'valid finance charge type remains allowed'
);

select lives_ok(
  $$update public.finance_charge_types set display_name='Updated Scope Fee', default_amount=125, active=false where id='ae820000-0000-4000-8000-000000000001'$$,
  'ordinary finance charge type configuration remains mutable'
);

select throws_ok(
  $$update public.finance_charge_types set charge_code='REWRITTEN' where id='ae820000-0000-4000-8000-000000000001'$$,
  'Finance charge type tenant, school, and charge code are immutable',
  'finance charge code cannot be repurposed after creation'
);

select throws_ok(
  $$update public.finance_charge_types set tenant_id='ae800000-0000-4000-8000-000000000001', school_id='ae810000-0000-4000-8000-000000000001' where id='ae820000-0000-4000-8000-000000000001'$$,
  'Finance charge type tenant, school, and charge code are immutable',
  'finance charge type cannot move between schools'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_finance_charge_type_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_finance_charge_type_scope_integrity()','EXECUTE'),
  'finance charge type integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.finance_charge_types'::regclass and tgname='finance_charge_type_scope_integrity_trg' and not tgisinternal),
  1,
  'finance charge types have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
