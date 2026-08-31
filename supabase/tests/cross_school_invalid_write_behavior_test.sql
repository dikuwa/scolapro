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
) values (
  '00000000-0000-0000-0000-000000000000',
  'fb000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'cross-school-write-admin@scolapro.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.tenants(id,name,slug)
values('fb111111-1111-4111-8111-111111111111','Cross School Write QA','cross-school-write-qa');

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
('fb222222-2222-4222-8222-222222222221','fb111111-1111-4111-8111-111111111111','Write Scope School A','WRITE-A-001','Khomas','Windhoek'),
('fb222222-2222-4222-8222-222222222222','fb111111-1111-4111-8111-111111111111','Write Scope School B','WRITE-B-001','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  'fb111111-1111-4111-8111-111111111111',
  'fb222222-2222-4222-8222-222222222221',
  'fb000000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
('fb333333-3333-4333-8333-333333333331','fb111111-1111-4111-8111-111111111111','Allowed','Learner','2010-01-01','unspecified'),
('fb333333-3333-4333-8333-333333333332','fb111111-1111-4111-8111-111111111111','Blocked','Learner','2010-01-02','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('fb444444-4444-4444-8444-444444444441','fb111111-1111-4111-8111-111111111111','fb222222-2222-4222-8222-222222222221','fb333333-3333-4333-8333-333333333331',2026,'2026-01-12','current'),
('fb444444-4444-4444-8444-444444444442','fb111111-1111-4111-8111-111111111111','fb222222-2222-4222-8222-222222222222','fb333333-3333-4333-8333-333333333332',2026,'2026-01-12','current');

set local role authenticated;
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select results_eq(
  $$update public.schools
    set name='UNAUTHORIZED SCHOOL WRITE'
    where id='fb222222-2222-4222-8222-222222222222'
    returning id$$,
  ARRAY[]::uuid[],
  'school admin cannot update another school in the same tenant'
);

select results_eq(
  $$update public.learners
    set preferred_name='UNAUTHORIZED LEARNER WRITE'
    where id='fb333333-3333-4333-8333-333333333332'
    returning id$$,
  ARRAY[]::uuid[],
  'school admin cannot update a learner enrolled only at another school'
);

select results_eq(
  $$update public.enrolments
    set status='withdrawn'
    where id='fb444444-4444-4444-8444-444444444442'
    returning id$$,
  ARRAY[]::uuid[],
  'school admin cannot update another school enrolment'
);

select ok(
  not has_table_privilege('authenticated', 'public.enrolments', 'DELETE'),
  'authenticated clients cannot directly delete enrolments'
);

select results_eq(
  $$update public.learners
    set preferred_name='Allowed Update'
    where id='fb333333-3333-4333-8333-333333333331'
    returning id$$,
  ARRAY['fb333333-3333-4333-8333-333333333331'::uuid],
  'school admin retains learner update access inside their own school scope'
);

select results_eq(
  $$update public.enrolments
    set admission_number='WRITE-QA-001'
    where id='fb444444-4444-4444-8444-444444444441'
    returning id$$,
  ARRAY['fb444444-4444-4444-8444-444444444441'::uuid],
  'school admin retains enrolment update access inside their own school scope'
);

reset role;
select * from finish();
rollback;
