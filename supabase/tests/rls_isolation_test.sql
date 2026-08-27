begin;

select plan(6);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'school-admin-a@scolapro.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'school-admin-b@scolapro.invalid',
    '',
    now(),
    now(),
    now()
  );

insert into public.tenants (id, name, slug)
values ('81111111-1111-4111-8111-111111111111', 'Isolation Test Tenant', 'isolation-test-tenant');

insert into public.schools (id, tenant_id, name, emis_number, region, town)
values (
  '82222222-2222-4222-8222-222222222222',
  '81111111-1111-4111-8111-111111111111',
  'Isolation Test School',
  'TEST002',
  'Khomas',
  'Windhoek'
);

insert into public.school_memberships (
  tenant_id,
  school_id,
  user_id,
  role_key
) values
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '70000000-0000-4000-8000-000000000001',
    'school_admin'
  ),
  (
    '81111111-1111-4111-8111-111111111111',
    '82222222-2222-4222-8222-222222222222',
    '70000000-0000-4000-8000-000000000002',
    'school_admin'
  );

insert into public.learners (
  id,
  tenant_id,
  first_names,
  surname,
  date_of_birth,
  sex
) values (
  '85000000-0000-4000-8000-000000000001',
  '81111111-1111-4111-8111-111111111111',
  'Isolation',
  'Learner',
  '2010-01-01',
  'unspecified'
);

insert into public.enrolments (
  id,
  tenant_id,
  school_id,
  learner_id,
  academic_year,
  enrolled_from,
  status
) values (
  '86000000-0000-4000-8000-000000000001',
  '81111111-1111-4111-8111-111111111111',
  '82222222-2222-4222-8222-222222222222',
  '85000000-0000-4000-8000-000000000001',
  2026,
  '2026-01-12',
  'current'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.schools),
  1,
  'school admin can only read their accessible school'
);

select is(
  (select count(*)::integer from public.tenants),
  1,
  'school admin can only read their accessible tenant'
);

select is(
  (select count(*)::integer from public.learners),
  2,
  'school admin can read learners enrolled at their school'
);

select is(
  (select count(*)::integer from public.enrolments),
  2,
  'school admin can read only enrolments from their school'
);

select is(
  (select count(*)::integer from public.schools where id = '82222222-2222-4222-8222-222222222222'),
  0,
  'school admin cannot read another tenant school'
);

select is(
  (select count(*)::integer from public.learners where id = '85000000-0000-4000-8000-000000000001'),
  0,
  'school admin cannot read a learner enrolled only in another tenant'
);

select * from finish();
rollback;
