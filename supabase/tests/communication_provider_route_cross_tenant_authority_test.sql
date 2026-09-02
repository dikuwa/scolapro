begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fdd00000-0000-4000-8000-000000000001','provider-route-school-admin@example.test','authenticated','authenticated',now(),now()),
('fdd00000-0000-4000-8000-000000000002','provider-route-support@example.test','authenticated','authenticated',now(),now()),
('fdd00000-0000-4000-8000-000000000003','provider-route-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug) values
('fdd10000-0000-4000-8000-000000000001','Provider Route Tenant A','provider-route-a'),
('fdd10000-0000-4000-8000-000000000002','Provider Route Tenant B','provider-route-b');

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fdd20000-0000-4000-8000-000000000001','fdd10000-0000-4000-8000-000000000001','Provider Route School A','PROV-A-001','active'),
('fdd20000-0000-4000-8000-000000000002','fdd10000-0000-4000-8000-000000000002','Provider Route School B','PROV-B-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('fdd10000-0000-4000-8000-000000000001','fdd20000-0000-4000-8000-000000000001','fdd00000-0000-4000-8000-000000000001','school_admin',current_date-2);

insert into public.platform_memberships(user_id,role_key,active_from) values
('fdd00000-0000-4000-8000-000000000002','platform_support',current_date-2),
('fdd00000-0000-4000-8000-000000000003','platform_admin',current_date-2);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000001'::uuid,
    'fdd20000-0000-4000-8000-000000000001'::uuid,
    'email'::text,'school-a-email'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'School Admin can configure a provider route for their exact school and tenant'
);
select throws_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000002'::uuid,
    'fdd20000-0000-4000-8000-000000000001'::uuid,
    'email'::text,'mismatched-tenant'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','School does not belong to tenant',
  'School Admin cannot pair their school with another tenant ID'
);
select throws_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000002'::uuid,
    'fdd20000-0000-4000-8000-000000000002'::uuid,
    'email'::text,'other-school'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','Permission denied',
  'School Admin cannot configure an unrelated school even when tenant and school IDs agree'
);
select throws_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000001'::uuid,
    null::uuid,
    'email'::text,'tenant-wide-school-admin'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','Permission denied',
  'School Admin cannot create tenant-wide provider routes'
);
reset role;

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000002'::uuid,
    'fdd20000-0000-4000-8000-000000000002'::uuid,
    'sms'::text,'support-write'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','Permission denied',
  'Platform Support cannot configure provider routes'
);
reset role;

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000001'::uuid,
    'fdd20000-0000-4000-8000-000000000002'::uuid,
    'sms'::text,'platform-mismatch'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','School does not belong to tenant',
  'Platform Admin cannot bypass physical tenant-school consistency'
);
select lives_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000002'::uuid,
    'fdd20000-0000-4000-8000-000000000002'::uuid,
    'sms'::text,'school-b-sms'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'Platform Admin can configure a valid school-specific route cross-tenant'
);
select lives_ok(
  $$select public.set_communication_provider_route(
    'fdd10000-0000-4000-8000-000000000002'::uuid,
    null::uuid,
    'email'::text,'tenant-b-default'::text,200::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'Platform Admin can configure a tenant-wide provider route'
);
reset role;

select is(
  (select count(*)::integer from public.communication_provider_routes where tenant_id in (
    'fdd10000-0000-4000-8000-000000000001'::uuid,
    'fdd10000-0000-4000-8000-000000000002'::uuid
  )),
  3,
  'only the three authorized provider routes were created'
);

select * from finish();
rollback;
