begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fda00000-0000-4000-8000-000000000001','duty-boundary-staff@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fda10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fda00000-0000-4000-8000-000000000001',
  'DUTY-BOUNDARY-001','Duty','Boundary','active'
);

-- Duty creation itself is governed by a staff-linked school membership on the
-- duty start date. Both recognized placement sources end yesterday, while the
-- duty row intentionally remains open-ended so stale authority can be tested.
insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fda00000-0000-4000-8000-000000000001',
  'fda10000-0000-4000-8000-000000000001',
  'teacher',current_date-10,current_date-1
);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fda10000-0000-4000-8000-000000000001',
  'staff',current_date-10,current_date-1,
  'fda00000-0000-4000-8000-000000000001'
);

insert into public.school_duty_assignments(
  tenant_id,school_id,staff_member_id,duty_key,active_from,active_to,assigned_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fda10000-0000-4000-8000-000000000001',
  'late_arrival_recorder',current_date-10,null,
  'fda00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fda00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select ok(
  app_private.has_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'late_arrival_recorder',
    current_date-2
  ),
  'school duty is valid while the staff school placement is still effective'
);

select is(
  app_private.has_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'late_arrival_recorder',
    current_date
  ),
  false,
  'school duty authority expires after the staff school placement ends'
);

select is(
  app_private.has_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'late_arrival_recorder',
    current_date+3
  ),
  false,
  'open-ended duty does not restore authority on later dates without placement'
);

select throws_ok(
  $$select public.record_school_late_arrival(
    '60000000-0000-4000-8000-000000000001'::uuid,
    current_date,
    '08:10'::time,
    'duty placement boundary regression'
  )$$,
  'P0001',
  'Permission denied',
  'former school staff cannot use an open-ended duty to record a late arrival'
);

select is(
  (select count(*)::integer
   from public.school_late_arrival_events
   where recorded_by_user_id='fda00000-0000-4000-8000-000000000001'),
  0,
  'denied duty-based operation creates no late-arrival event'
);

reset role;
select * from finish();
rollback;
