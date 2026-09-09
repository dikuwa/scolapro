begin;

select plan(4);

insert into public.tenants(id,name,slug) values
  ('fa100000-0000-4000-8000-000000000001','Learner Boundary Tenant','learner-boundary-tenant');

insert into public.schools(id,tenant_id,name) values
  ('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Learner Boundary School A'),
  ('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000001','Learner Boundary School B');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa000000-0000-4000-8000-000000000001','platform-only-learner-boundary@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','school-admin-learner-boundary@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000003','cross-school-admin-learner-boundary@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000004','unrelated-school-role-learner-boundary@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fa000000-0000-4000-8000-000000000001','platform_admin',current_date);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','school_admin',current_date),
  ('fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000003','school_admin',current_date),
  ('fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004','social_worker',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select * from public.search_operational_learner_directory('fa200000-0000-4000-8000-000000000001',null,30)$$,
  'Permission denied',
  'platform administration authority alone does not grant operational learner-directory visibility'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select * from public.search_operational_learner_directory('fa200000-0000-4000-8000-000000000001',null,30)$$,
  'properly school-authorized administrator can use the operational learner directory'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.search_operational_learner_directory('fa200000-0000-4000-8000-000000000001',null,30)$$,
  'Permission denied',
  'administrator membership at another school does not cross the learner-directory boundary'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select * from public.search_operational_learner_directory('fa200000-0000-4000-8000-000000000001',null,30)$$,
  'Permission denied',
  'ordinary school membership without an operational-directory role remains denied'
);

select * from finish();
rollback;
