begin;

select plan(20);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('54700000-0000-4000-8000-000000000001','tenant-qa-admin@example.test','authenticated','authenticated',now(),now()),
  ('54700000-0000-4000-8000-000000000002','tenant-qa-support@example.test','authenticated','authenticated',now(),now()),
  ('54700000-0000-4000-8000-000000000003','tenant-qa-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('54700000-0000-4000-8000-000000000001','platform_admin',current_date),
  ('54700000-0000-4000-8000-000000000002','platform_support',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','54700000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.create_tenant_school('Support Tenant','tenant-qa-canonical','Support School','QA-547',null,null)$$,
  '42501','Not authorized to create tenants.',
  'Platform Support cannot provision tenants or schools'
);

select set_config('request.jwt.claim.sub','54700000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.create_tenant_school('Tenant QA Canonical','tenant-qa-canonical','Tenant QA School','QA-547','Khomas','Windhoek')$$,
  'governed Platform Admin can atomically provision a tenant and first school'
);

select is(
  (select count(*)::integer from public.tenants where slug='tenant-qa-canonical'),
  1,
  'canonical tenant slug produces exactly one tenant'
);

select is(
  (select count(*)::integer
   from public.schools s join public.tenants t on t.id=s.tenant_id
   where t.slug='tenant-qa-canonical' and s.name='Tenant QA School'),
  1,
  'initial provisioning produces exactly one canonical school'
);

select is(
  (select count(*)::integer
   from public.audit_events ae join public.tenants t on t.id=ae.tenant_id
   where t.slug='tenant-qa-canonical'
     and ae.event_type='tenant.created'
     and ae.actor_user_id='54700000-0000-4000-8000-000000000001'),
  1,
  'tenant provisioning preserves Platform Admin audit provenance'
);

select is(
  (select count(*)::integer
   from public.tenant_lifecycle_events le join public.tenants t on t.id=le.tenant_id
   where t.slug='tenant-qa-canonical'
     and le.event_type='created'
     and le.actor_user_id='54700000-0000-4000-8000-000000000001'),
  1,
  'tenant provisioning records canonical created lifecycle provenance'
);

select throws_ok(
  $$select public.create_tenant_school('Duplicate Tenant','tenant-qa-canonical','Duplicate School','QA-547-DUP',null,null)$$,
  '23505',
  null,
  'duplicate canonical tenant slug is rejected'
);

select is(
  (select count(*)::integer from public.tenants where slug='tenant-qa-canonical'),
  1,
  'failed duplicate provisioning does not create another tenant'
);

select is(
  (select count(*)::integer
   from public.schools s join public.tenants t on t.id=s.tenant_id
   where t.slug='tenant-qa-canonical'),
  1,
  'failed duplicate provisioning does not leave an orphan or duplicate school'
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
select t.id,s.id,'54700000-0000-4000-8000-000000000003','school_admin',current_date
from public.tenants t
join public.schools s on s.tenant_id=t.id
where t.slug='tenant-qa-canonical' and s.name='Tenant QA School';

select set_config('request.jwt.claim.sub','54700000-0000-4000-8000-000000000003',true);
select throws_ok(
  format(
    'select public.update_platform_tenant_configuration(%L::uuid,%L,%L)',
    (select id from public.tenants where slug='tenant-qa-canonical'),
    'School Admin Rename',
    'suspended'
  ),
  'P0001','Platform administrator authority required',
  'school administrator cannot mutate platform tenant lifecycle'
);

select set_config('request.jwt.claim.sub','54700000-0000-4000-8000-000000000002',true);
select throws_ok(
  format(
    'select public.update_platform_tenant_configuration(%L::uuid,%L,%L)',
    (select id from public.tenants where slug='tenant-qa-canonical'),
    'Support Rename',
    'suspended'
  ),
  'P0001','Platform administrator authority required',
  'Platform Support cannot mutate platform tenant lifecycle'
);

select set_config('request.jwt.claim.sub','54700000-0000-4000-8000-000000000001',true);
select lives_ok(
  format(
    'select public.update_platform_tenant_configuration(%L::uuid,%L,%L)',
    (select id from public.tenants where slug='tenant-qa-canonical'),
    'Tenant QA Canonical',
    'suspended'
  ),
  'Platform Admin can suspend a tenant through the existing governed configuration workflow'
);

select is(
  (select status from public.tenants where slug='tenant-qa-canonical'),
  'suspended',
  'tenant suspension changes current status without deleting tenant identity'
);

select is(
  (select count(*)::integer
   from public.tenant_lifecycle_events le join public.tenants t on t.id=le.tenant_id
   where t.slug='tenant-qa-canonical' and le.event_type='suspended'),
  1,
  'tenant suspension appends lifecycle history'
);

select lives_ok(
  format(
    'select public.update_platform_tenant_configuration(%L::uuid,%L,%L)',
    (select id from public.tenants where slug='tenant-qa-canonical'),
    'Tenant QA Canonical',
    'archived'
  ),
  'Platform Admin can archive a tenant through the existing governed configuration workflow'
);

select is(
  (select count(*)::integer
   from public.tenant_lifecycle_events le join public.tenants t on t.id=le.tenant_id
   where t.slug='tenant-qa-canonical' and le.event_type='archived'),
  1,
  'tenant archival appends lifecycle history rather than deleting prior events'
);

select is(
  (select count(*)::integer
   from public.tenant_lifecycle_events le join public.tenants t on t.id=le.tenant_id
   where t.slug='tenant-qa-canonical' and le.event_type in ('created','suspended','archived')),
  3,
  'created, suspended and archived lifecycle facts coexist as immutable history'
);

select throws_ok(
  $$update public.tenant_lifecycle_events
      set event_type='activated'
    where tenant_id=(select id from public.tenants where slug='tenant-qa-canonical')
      and event_type='suspended'$$,
  'Tenant lifecycle events are append-only historical records',
  'historical tenant lifecycle facts cannot be rewritten'
);

select is(
  (select count(*)::integer
   from public.audit_events ae join public.tenants t on t.id=ae.tenant_id
   where t.slug='tenant-qa-canonical'
     and ae.event_type='tenant.configuration.updated'
     and ae.actor_user_id='54700000-0000-4000-8000-000000000001'),
  2,
  'tenant status transitions retain general audit provenance alongside lifecycle history'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_is_active_platform_admin(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_is_active_platform_admin(uuid)','EXECUTE'),
  'platform lifecycle actor authority helper remains private'
);

select * from finish();
rollback;
