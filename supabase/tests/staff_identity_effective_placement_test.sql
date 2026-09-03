begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdb00000-0000-4000-8000-000000000001','staff-id-viewer@example.test','authenticated','authenticated',now(),now()),
  ('fdb00000-0000-4000-8000-000000000002','staff-id-current@example.test','authenticated','authenticated',now(),now()),
  ('fdb00000-0000-4000-8000-000000000003','staff-id-former@example.test','authenticated','authenticated',now(),now()),
  ('fdb00000-0000-4000-8000-000000000004','staff-id-future@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb00000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fdb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fdb00000-0000-4000-8000-000000000002','ID-CURRENT-001','Current','Staff','active'),
  ('fdb10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fdb00000-0000-4000-8000-000000000003','ID-FORMER-001','Former','Staff','active'),
  ('fdb10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fdb00000-0000-4000-8000-000000000004','ID-FUTURE-001','Future','Staff','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fdb10000-0000-4000-8000-000000000001','staff',current_date-30,null,
  'fdb00000-0000-4000-8000-000000000001'
),
(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fdb10000-0000-4000-8000-000000000002','staff',current_date-30,current_date-1,
  'fdb00000-0000-4000-8000-000000000001'
),
(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fdb10000-0000-4000-8000-000000000003','staff',current_date+10,null,
  'fdb00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.staff_members where id='fdb10000-0000-4000-8000-000000000001'),
  1,
  'school viewer can read staff identity for a currently placed staff member'
);
select is(
  (select count(*)::integer from public.staff_members where id='fdb10000-0000-4000-8000-000000000002'),
  0,
  'school viewer cannot retain raw staff identity access after target placement ends'
);
select is(
  (select count(*)::integer from public.staff_members where id='fdb10000-0000-4000-8000-000000000003'),
  0,
  'school viewer cannot read raw staff identity before a future target placement starts'
);
select is(
  (select count(*)::integer from public.staff_members where id in (
    'fdb10000-0000-4000-8000-000000000001',
    'fdb10000-0000-4000-8000-000000000002',
    'fdb10000-0000-4000-8000-000000000003'
  )),
  1,
  'school-scoped staff identity visibility includes only currently placed targets'
);

select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.staff_members where id='fdb10000-0000-4000-8000-000000000002'),
  1,
  'former staff member can still read their own raw identity'
);

select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.staff_members where id='fdb10000-0000-4000-8000-000000000003'),
  1,
  'future staff member can still read their own raw identity'
);

reset role;
select * from finish();
rollback;
