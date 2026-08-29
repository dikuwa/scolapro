begin;

-- This behavioral suite also forces Database CI to exercise the production-aligned migration ordering from a clean database.
select plan(8);

insert into auth.users (id,email,aud,role,created_at,updated_at)
values ('f6000000-0000-4000-8000-000000000001','staff-assignment-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.schools(id,tenant_id,name,emis_number,status)
values('f6200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Isolation Secondary School','TST-ISO-001','active');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f6100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','TST-STAFF-001','Test','Teacher','active');

select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','f6100000-0000-4000-8000-000000000001','teacher','Science Teacher','2026-01-01','2026-06-30')$$,
  'school admin can create an effective-dated staff placement'
);

select throws_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','f6100000-0000-4000-8000-000000000001','teacher','Science Teacher','2026-03-01','2026-12-31')$$,
  'Staff member already has an overlapping assignment at this school',
  'overlapping placement for the same staff member and school is blocked'
);

select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','f6100000-0000-4000-8000-000000000001','teacher','Senior Science Teacher','2026-07-01',null)$$,
  'adjacent non-overlapping staff placement is allowed'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='f6100000-0000-4000-8000-000000000001'),
  2,
  'only the two non-overlapping staff placements exist'
);

select throws_ok(
  $$select public.assign_staff_to_school('f6200000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000001','teacher','Unauthorized Placement','2026-01-01',null)$$,
  'Permission denied',
  'school admin cannot place staff into another school without management authority there'
);

select throws_ok(
  format(
    'select public.end_staff_school_assignment(%L::uuid,%L::date)',
    (select id from public.staff_school_assignments where staff_member_id='f6100000-0000-4000-8000-000000000001' and effective_from='2026-01-01'),
    '2026-07-15'
  ),
  'Cannot extend a closed assignment through the end-assignment workflow',
  'end workflow cannot extend a previously closed placement'
);

select lives_ok(
  format(
    'select public.end_staff_school_assignment(%L::uuid,%L::date)',
    (select id from public.staff_school_assignments where staff_member_id='f6100000-0000-4000-8000-000000000001' and effective_from='2026-01-01'),
    '2026-05-31'
  ),
  'end workflow may shorten an existing placement without deleting history'
);

select ok(
  (select count(*) from public.audit_events where actor_user_id='f6000000-0000-4000-8000-000000000001' and event_type in ('staff.school_assignment.saved','staff.school_assignment.ended')) >= 3,
  'staff assignment lifecycle writes auditable events'
);

select * from finish();
rollback;
