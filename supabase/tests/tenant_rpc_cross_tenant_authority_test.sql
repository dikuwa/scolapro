begin;

select plan(15);

-- Cross-tenant authorization matrix:
-- * ordinary School Admin belongs only to Tenant A / School A
-- * Platform Support has explicit support-safe tenant metadata visibility
-- * Platform Admin has deliberate cross-tenant administrative authority
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fdc00000-0000-4000-8000-000000000001','tenant-matrix-school-admin@example.test','authenticated','authenticated',now(),now()),
('fdc00000-0000-4000-8000-000000000002','tenant-matrix-support@example.test','authenticated','authenticated',now(),now()),
('fdc00000-0000-4000-8000-000000000003','tenant-matrix-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug) values
('fdc10000-0000-4000-8000-000000000001','Tenant Matrix A','tenant-matrix-a'),
('fdc10000-0000-4000-8000-000000000002','Tenant Matrix B','tenant-matrix-b');

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fdc20000-0000-4000-8000-000000000001','fdc10000-0000-4000-8000-000000000001','Tenant Matrix School A','TM-A-001','active'),
('fdc20000-0000-4000-8000-000000000002','fdc10000-0000-4000-8000-000000000002','Tenant Matrix School B','TM-B-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('fdc10000-0000-4000-8000-000000000001','fdc20000-0000-4000-8000-000000000001','fdc00000-0000-4000-8000-000000000001','school_admin',current_date-2);

insert into public.platform_memberships(user_id,role_key,active_from) values
('fdc00000-0000-4000-8000-000000000002','platform_support',current_date-2),
('fdc00000-0000-4000-8000-000000000003','platform_admin',current_date-2);

insert into public.learners(id,tenant_id,first_names,surname,preferred_name,sex) values
('fdc30000-0000-4000-8000-000000000001','fdc10000-0000-4000-8000-000000000002','Tenant B','Learner','Before','unspecified');
insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source) values
('fdc40000-0000-4000-8000-000000000001','fdc10000-0000-4000-8000-000000000002','fdc20000-0000-4000-8000-000000000002','fdc30000-0000-4000-8000-000000000001','TM-B-L001','imported');

insert into public.tenant_features(
  id,tenant_id,feature_key,enabled,configuration,effective_from,updated_by_user_id
) values(
  'fdc50000-0000-4000-8000-000000000001','fdc10000-0000-4000-8000-000000000002','parent_portal',true,'{}'::jsonb,current_date,'fdc00000-0000-4000-8000-000000000003'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(app_private.has_tenant_access('fdc10000-0000-4000-8000-000000000001'),true,'School Admin has tenant access through their own school membership');
select is(app_private.has_tenant_access('fdc10000-0000-4000-8000-000000000002'),false,'School Admin tenant access does not cross into another tenant');
select is((select count(*)::integer from public.tenant_features where tenant_id='fdc10000-0000-4000-8000-000000000002'),0,'ordinary School Admin cannot read another tenant feature rows');
select throws_ok(
  $$select public.set_tenant_feature('fdc10000-0000-4000-8000-000000000002','library',true,'{}'::jsonb,current_date)$$,
  'P0001','Permission denied',
  'ordinary School Admin cannot mutate another tenant feature through SECURITY DEFINER RPC'
);
select throws_ok(
  $$select public.update_learner_operational_profile('fdc30000-0000-4000-8000-000000000001','fdc20000-0000-4000-8000-000000000002','Borrowed')$$,
  'P0001','Permission denied',
  'School Admin cannot substitute another tenant school and learner IDs into learner profile RPC'
);
reset role;

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(app_private.has_tenant_access('fdc10000-0000-4000-8000-000000000002'),true,'Platform Support retains deliberate cross-tenant support metadata access');
select is((select count(*)::integer from public.tenant_features where tenant_id='fdc10000-0000-4000-8000-000000000002'),1,'Platform Support may read tenant feature configuration for troubleshooting');
select throws_ok(
  $$select public.set_tenant_feature('fdc10000-0000-4000-8000-000000000002','library',true,'{}'::jsonb,current_date)$$,
  'P0001','Permission denied',
  'Platform Support tenant read access does not become tenant feature write authority'
);
select throws_ok(
  $$select public.update_learner_operational_profile('fdc30000-0000-4000-8000-000000000001','fdc20000-0000-4000-8000-000000000002','Support Edit')$$,
  'P0001','Permission denied',
  'Platform Support cannot mutate operational learner identity through broad school metadata access'
);
select throws_ok(
  $$select public.create_tenant_school('Support Created','support-created','Support School','SUP-001',null,null)$$,
  '42501','Not authorized to create tenants.',
  'Platform Support cannot use platform tenant provisioning RPC'
);
reset role;

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(app_private.has_tenant_access('fdc10000-0000-4000-8000-000000000002'),true,'Platform Admin retains deliberate cross-tenant access');
select lives_ok(
  $$select public.set_tenant_feature('fdc10000-0000-4000-8000-000000000002','library',true,'{"source":"qa"}'::jsonb,current_date)$$,
  'Platform Admin can govern a feature in another tenant'
);
select lives_ok(
  $$select public.update_learner_operational_profile('fdc30000-0000-4000-8000-000000000001','fdc20000-0000-4000-8000-000000000002','Platform Governed')$$,
  'Platform Admin can use deliberate cross-school administrative authority at governed learner RPC'
);
reset role;

select is((select preferred_name from public.learners where id='fdc30000-0000-4000-8000-000000000001'),'Platform Governed','only the authorized Platform Admin learner mutation persisted inside the test transaction');
select is((select count(*)::integer from public.tenant_features where tenant_id='fdc10000-0000-4000-8000-000000000002' and feature_key='library'),1,'only governed Platform Admin feature mutation created the new Tenant B feature');

select * from finish();
rollback;
