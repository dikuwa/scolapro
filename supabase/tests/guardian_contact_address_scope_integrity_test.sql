begin;

select plan(8);

insert into public.tenants(id,name,slug)
values
  ('fb100000-0000-4000-8000-000000000001','Guardian Detail Tenant A','guardian-detail-tenant-a'),
  ('fb100000-0000-4000-8000-000000000002','Guardian Detail Tenant B','guardian-detail-tenant-b');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values
  ('fb110000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','Guardian','One'),
  ('fb110000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000002','Guardian','Two');

select throws_ok(
  $$insert into public.guardian_contacts(tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from)
    values('fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000002','mobile','0810000000',true,current_date)$$,
  'Guardian contact scope mismatch: guardian does not belong to tenant',
  'guardian contact must match guardian tenant'
);

select lives_ok(
  $$insert into public.guardian_contacts(id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from)
    values('fb120000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','mobile','0810000001',true,current_date)$$,
  'valid guardian contact remains allowed'
);

select lives_ok(
  $$update public.guardian_contacts set contact_value='0810000002', is_primary=false where id='fb120000-0000-4000-8000-000000000001'$$,
  'guardian contact details remain mutable'
);

select throws_ok(
  $$update public.guardian_contacts set guardian_id='fb110000-0000-4000-8000-000000000002' where id='fb120000-0000-4000-8000-000000000001'$$,
  'Guardian contact tenant and guardian are immutable',
  'guardian contact identity cannot be moved after creation'
);

select throws_ok(
  $$insert into public.guardian_addresses(tenant_id,guardian_id,address_type,address_line_1,country,is_primary,effective_from)
    values('fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000002','physical','1 Test Street','Namibia',true,current_date)$$,
  'Guardian address scope mismatch: guardian does not belong to tenant',
  'guardian address must match guardian tenant'
);

select lives_ok(
  $$insert into public.guardian_addresses(id,tenant_id,guardian_id,address_type,address_line_1,country,is_primary,effective_from)
    values('fb130000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','physical','1 Test Street','Namibia',true,current_date)$$,
  'valid guardian address remains allowed'
);

select lives_ok(
  $$update public.guardian_addresses set address_line_1='2 Test Street', is_primary=false where id='fb130000-0000-4000-8000-000000000001'$$,
  'guardian address details remain mutable'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_guardian_contact_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_guardian_contact_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_guardian_address_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_guardian_address_scope_integrity()','EXECUTE'),
  'guardian contact and address integrity helpers are private from client roles'
);

select * from finish();
rollback;