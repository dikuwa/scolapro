begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fda10000-0000-4000-8000-000000000001','single-staff-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda10000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.schools(id,tenant_id,name,emis_number,status)
values('fda12000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other Staff School','STAFF-ISO-2','active');

select set_config('request.jwt.claim.sub','fda10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.create_or_assign_school_staff('22222222-2222-4222-8222-222222222222',' tst-emp-900 ','Lydia','Nghipandulwa','teacher','Science Teacher','2026-01-15')$$,
  'school admin can create a staff identity and placement without an account'
);

select is(
  (select employee_number from public.staff_members where employee_number='TST-EMP-900'),
  'TST-EMP-900',
  'employee number is normalized to a stable uppercase identity key'
);

select is(
  (select user_id from public.staff_members where employee_number='TST-EMP-900'),
  null::uuid,
  'single staff creation does not create or require a login account'
);

select ok(
  exists(
    select 1 from public.staff_school_assignments ssa
    join public.staff_members sm on sm.id=ssa.staff_member_id
    where sm.employee_number='TST-EMP-900'
      and ssa.school_id='22222222-2222-4222-8222-222222222222'
      and ssa.assignment_type='teacher'
      and ssa.position_title='Science Teacher'
      and ssa.effective_from='2026-01-15'
  ),
  'single staff creation creates the effective-dated school placement'
);

select throws_ok(
  $$select public.create_or_assign_school_staff('22222222-2222-4222-8222-222222222222','TST-EMP-900','Lydia','Nghipandulwa','teacher','Science Teacher','2026-03-01')$$,
  'This staff member already has a school assignment covering the selected start date',
  'duplicate overlapping placement is rejected before creating duplicate assignment history'
);

select throws_ok(
  $$select public.create_or_assign_school_staff('22222222-2222-4222-8222-222222222222','TST-EMP-900','Different','Person','teacher','Teacher','2027-01-01')$$,
  'Employee number already belongs to a different staff identity',
  'employee number cannot silently merge a different name identity'
);

select throws_ok(
  $$select public.create_or_assign_school_staff('fda12000-0000-4000-8000-000000000001','TST-EMP-901','No','Access','staff',null,'2026-01-15')$$,
  'Permission denied',
  'school admin cannot create staff in another school without authority'
);

select ok(
  exists(
    select 1 from public.audit_events ae
    join public.staff_members sm on sm.id=ae.entity_id
    where sm.employee_number='TST-EMP-900'
      and ae.event_type='staff.single_onboarding.completed'
      and ae.metadata->>'login_account_created'='false'
  ),
  'single staff onboarding records an explicit audited no-account outcome'
);

select * from finish();
rollback;
