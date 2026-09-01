begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ff700000-0000-4000-8000-000000000001','school-duty-scope-a@example.test','authenticated','authenticated',now(),now()),
  ('ff700000-0000-4000-8000-000000000002','school-duty-scope-a2@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('ff710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ff700000-0000-4000-8000-000000000001','Duty','Staff A','active'),
  ('ff710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ff700000-0000-4000-8000-000000000002','Duty','Staff A2','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff700000-0000-4000-8000-000000000001','ff710000-0000-4000-8000-000000000001','teacher','2026-01-01');

insert into public.tenants(id,name,slug)
values('ff800000-0000-4000-8000-000000000001','School Duty Scope Tenant B','school-duty-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ff810000-0000-4000-8000-000000000001','ff800000-0000-4000-8000-000000000001','School Duty Scope School B','SDS-B','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('ff820000-0000-4000-8000-000000000001','ff800000-0000-4000-8000-000000000001','Duty','Staff B','active');

select throws_ok(
  $$insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('ff800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ff710000-0000-4000-8000-000000000001','late_arrival_recorder','2026-02-01','ff700000-0000-4000-8000-000000000001')$$,
  'School duty scope mismatch: school does not belong to tenant',
  'school duty tenant must match school tenant'
);

select throws_ok(
  $$insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff820000-0000-4000-8000-000000000001','late_arrival_recorder','2026-02-01','ff700000-0000-4000-8000-000000000001')$$,
  'School duty scope mismatch: staff member does not belong to tenant',
  'school duty staff must match tenant'
);

select throws_ok(
  $$insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff710000-0000-4000-8000-000000000002','late_arrival_recorder','2026-02-01','ff700000-0000-4000-8000-000000000001')$$,
  'School duty scope mismatch: staff member is not assigned to school on duty start date',
  'school duty requires staff assignment to school on duty start date'
);

select lives_ok(
  $$insert into public.school_duty_assignments(id,tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('ff830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff710000-0000-4000-8000-000000000001','late_arrival_recorder','2026-02-01','ff700000-0000-4000-8000-000000000001')$$,
  'valid school duty assignment remains allowed'
);

select lives_ok(
  $$update public.school_duty_assignments set active_to='2026-03-01' where id='ff830000-0000-4000-8000-000000000001'$$,
  'ending a school duty remains allowed'
);

select throws_ok(
  $$update public.school_duty_assignments set duty_key='detention_supervisor' where id='ff830000-0000-4000-8000-000000000001'$$,
  'School duty tenant, school, staff, duty key, and start date are immutable',
  'school duty identity cannot be repurposed after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_duty_assignment_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_duty_assignment_scope_integrity()','EXECUTE'),
  'school duty integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.school_duty_assignments'::regclass and tgname='school_duty_assignment_scope_integrity_trg' and not tgisinternal),
  1,
  'school duty assignments have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
