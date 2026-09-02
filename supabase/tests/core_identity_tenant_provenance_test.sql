begin;

select plan(9);

insert into public.tenants(id,name,slug)
values
  ('ff110000-0000-4000-8000-000000000001','Core Identity Tenant A','core-identity-tenant-a'),
  ('ff110000-0000-4000-8000-000000000002','Core Identity Tenant B','core-identity-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ff120000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','Core Identity School','CORE-ID-1','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('ff130000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','Core','Learner','2010-01-01','unspecified');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('ff140000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','Core','Guardian');

select lives_ok(
  $$update public.schools set name='Core Identity School Updated',town='Okahandja',updated_at=now() where id='ff120000-0000-4000-8000-000000000001'$$,
  'ordinary school profile corrections remain allowed'
);

select lives_ok(
  $$update public.learners set preferred_name='Cory',updated_at=now() where id='ff130000-0000-4000-8000-000000000001'$$,
  'ordinary learner identity corrections remain allowed'
);

select lives_ok(
  $$update public.guardian_profiles set preferred_name='CG',updated_at=now() where id='ff140000-0000-4000-8000-000000000001'$$,
  'ordinary guardian profile corrections remain allowed'
);

select throws_ok(
  $$update public.schools set tenant_id='ff110000-0000-4000-8000-000000000002' where id='ff120000-0000-4000-8000-000000000001'$$,
  'schools identity, tenant ownership and creation provenance are immutable',
  'school cannot be rebound to another tenant'
);

select throws_ok(
  $$update public.learners set tenant_id='ff110000-0000-4000-8000-000000000002' where id='ff130000-0000-4000-8000-000000000001'$$,
  'learners identity, tenant ownership and creation provenance are immutable',
  'learner cannot be rebound to another tenant'
);

select throws_ok(
  $$update public.guardian_profiles set tenant_id='ff110000-0000-4000-8000-000000000002' where id='ff140000-0000-4000-8000-000000000001'$$,
  'guardian_profiles identity, tenant ownership and creation provenance are immutable',
  'guardian cannot be rebound to another tenant'
);

select throws_ok(
  $$update public.learners set created_at=created_at-interval '1 day' where id='ff130000-0000-4000-8000-000000000001'$$,
  'learners identity, tenant ownership and creation provenance are immutable',
  'learner creation timestamp cannot be rewritten'
);

select throws_ok(
  $$update public.guardian_profiles set id='ff140000-0000-4000-8000-000000000099' where id='ff140000-0000-4000-8000-000000000001'$$,
  'guardian_profiles identity, tenant ownership and creation provenance are immutable',
  'guardian primary identity cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_core_identity_tenant_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_core_identity_tenant_provenance()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'schools_tenant_provenance_integrity_trg',
    'learners_tenant_provenance_integrity_trg',
    'guardian_profiles_tenant_provenance_integrity_trg'
  ) and not tgisinternal)=3,
  'core identity provenance helper is private and all triggers are installed'
);

select * from finish();
rollback;
