begin;

select plan(6);

insert into public.tenants(id,name,slug)
values
  ('fc100000-0000-4000-8000-000000000001','Guardian Link Tenant A','guardian-link-tenant-a'),
  ('fc100000-0000-4000-8000-000000000002','Guardian Link Tenant B','guardian-link-tenant-b');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values
  ('fc110000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','Guardian','One'),
  ('fc110000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','Guardian','Two');

insert into auth.users(id,email,created_at,updated_at)
values
  ('fc120000-0000-4000-8000-000000000001','guardian-link-a@example.test',now(),now()),
  ('fc120000-0000-4000-8000-000000000002','guardian-link-b@example.test',now(),now());

select throws_ok(
  $$insert into public.guardian_user_links(tenant_id,guardian_id,user_id)
    values('fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000002','fc120000-0000-4000-8000-000000000001')$$,
  'Guardian user link scope mismatch: guardian does not belong to tenant',
  'guardian user link must match guardian tenant'
);

select lives_ok(
  $$insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
    values('fc130000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001','fc120000-0000-4000-8000-000000000001')$$,
  'valid guardian user link remains allowed'
);

select throws_ok(
  $$update public.guardian_user_links set guardian_id='fc110000-0000-4000-8000-000000000002' where id='fc130000-0000-4000-8000-000000000001'$$,
  'Guardian user link tenant, guardian, and user are immutable',
  'guardian identity cannot be moved after account linking'
);

select throws_ok(
  $$update public.guardian_user_links set user_id='fc120000-0000-4000-8000-000000000002' where id='fc130000-0000-4000-8000-000000000001'$$,
  'Guardian user link tenant, guardian, and user are immutable',
  'user identity cannot be replaced after account linking'
);

select throws_ok(
  $$update public.guardian_user_links set tenant_id='fc100000-0000-4000-8000-000000000002' where id='fc130000-0000-4000-8000-000000000001'$$,
  'Guardian user link tenant, guardian, and user are immutable',
  'guardian user link tenant cannot be moved'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_guardian_user_link_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_guardian_user_link_scope_integrity()','EXECUTE'),
  'guardian user link integrity helper is private from client roles'
);

select * from finish();
rollback;