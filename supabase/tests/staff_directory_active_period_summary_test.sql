begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdc80000-0000-4000-8000-000000000001','staff-summary-platform@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fdc80000-0000-4000-8000-000000000001','platform_admin',current_date-10);

insert into public.schools(id,tenant_id,name,emis_number,status)
values(
  'fdc81000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Staff Summary Period School',
  'STAFF-SUMMARY-PERIOD',
  'active'
);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values(
  'fdc82000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'STAFF-SUMMARY-001',
  'Scheduled',
  'Teacher',
  'active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
(
  'fdc83000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fdc81000-0000-4000-8000-000000000001',
  'fdc82000-0000-4000-8000-000000000001',
  'teacher','Current Teacher',current_date-10,current_date+5,
  'fdc80000-0000-4000-8000-000000000001'
),
(
  'fdc83000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'fdc81000-0000-4000-8000-000000000001',
  'fdc82000-0000-4000-8000-000000000001',
  'management','Future Management',current_date+10,null,
  'fdc80000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdc80000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select total_staff from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date)),
  1::bigint,
  'scheduled assignments still represent one staff identity in directory total'
);

select is(
  (select active_staff from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date)),
  1::bigint,
  'later future assignment does not hide the staff member who is active today'
);

select is(
  (select active_staff from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date+7)),
  0::bigint,
  'gap between scheduled assignment periods remains inactive'
);

select is(
  (select active_staff from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date+12)),
  1::bigint,
  'future assignment becomes active once its effective period begins'
);

select is(
  (select active_staff from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date-20)),
  0::bigint,
  'staff member is inactive before the first assignment begins'
);

select is(
  (select account_count from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date)),
  0::bigint,
  'assignment-only staff identity does not become a login account'
);

select ok(
  (select suggested_employee_number from public.get_staff_directory_summary('fdc81000-0000-4000-8000-000000000001',current_date)) like 'EMP-%',
  'staff summary retains editable employee-number suggestion behavior'
);

reset role;
select * from finish();
rollback;
