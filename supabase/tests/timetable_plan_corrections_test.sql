begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdf00000-0000-4000-8000-000000000001','timetable-correction-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdf00000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fdf10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','TT-CORR-001','Incoming','Teacher','active'),
  ('fdf10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','TT-CORR-002','Current','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  (
    'fdf20000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'fdf10000-0000-4000-8000-000000000001','teacher','Teacher',current_date+10,current_date+60,
    'fdf00000-0000-4000-8000-000000000001'
  ),
  (
    'fdf20000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'fdf10000-0000-4000-8000-000000000002','teacher','Teacher',current_date-30,current_date+9,
    'fdf00000-0000-4000-8000-000000000001'
  );

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values(
  'fdf30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'TT-CORR','Timetable Correction Fixture','active'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
)
select
  'fdf40000-0000-4000-8000-000000000001'::uuid,
  e.tenant_id,e.school_id,e.academic_year,
  'fdf30000-0000-4000-8000-000000000001'::uuid,e.grade_id,1,'active'
from public.enrolments e
where e.learner_id='50000000-0000-4000-8000-000000000001'::uuid
  and e.school_id='22222222-2222-4222-8222-222222222222'::uuid
  and e.status='current'
  and e.register_class_id is not null
order by e.created_at
limit 1;

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period
)
select
  'fdf50000-0000-4000-8000-000000000001'::uuid,
  so.tenant_id,so.school_id,so.academic_year,29,'Correction Period',true
from public.subject_offerings so
where so.id='fdf40000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdf00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_teacher_allocation_period(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fdf40000-0000-4000-8000-000000000001'),
    'fdf40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fdf10000-0000-4000-8000-000000000001',current_date+10,current_date+50
  )$$,
  'school admin can create a future teacher allocation plan'
);

select lives_ok(
  $$select public.update_teacher_allocation_period(
    (select id from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
    current_date+12,current_date+55
  )$$,
  'future teacher allocation dates can be corrected before the plan starts'
);

select is(
  (select active_from from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
  current_date+12,
  'corrected future allocation stores the new start date'
);

select is(
  (select active_to from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
  current_date+55,
  'corrected future allocation stores the new end date'
);

select throws_ok(
  $$select public.update_teacher_allocation_period(
    (select id from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
    current_date-1,current_date+55
  )$$,
  'Planned teacher allocation cannot be backdated',
  'planned allocation correction cannot rewrite the past'
);

select is(
  (select active_from from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
  current_date+12,
  'rejected backdate leaves the planned allocation unchanged'
);

select lives_ok(
  $$select public.create_teacher_allocation(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fdf40000-0000-4000-8000-000000000001'),
    'fdf40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fdf10000-0000-4000-8000-000000000002'
  )$$,
  'current teacher allocation fixture can be created'
);

select throws_ok(
  $$select public.update_teacher_allocation_period(
    (select id from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000002' and subject_offering_id='fdf40000-0000-4000-8000-000000000001'),
    current_date+1,current_date+9
  )$$,
  'Only planned future teacher allocations can be corrected',
  'effective current allocations cannot be rewritten through the planned-correction RPC'
);

select lives_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222'::uuid,
    (select academic_year::integer from public.subject_offerings where id='fdf40000-0000-4000-8000-000000000001'::uuid),
    'Z'::text,1::smallint,'fdf50000-0000-4000-8000-000000000001'::uuid,
    (select register_class_id::uuid from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001'::uuid and school_id='22222222-2222-4222-8222-222222222222'::uuid and status='current' and register_class_id is not null order by created_at limit 1),
    (select id::uuid from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001'::uuid and subject_offering_id='fdf40000-0000-4000-8000-000000000001'::uuid),null::text
  )$$,
  'future handover allocation can own a pre-planned timetable slot'
);

select lives_ok(
  $$select public.cancel_timetable_slot(
    (select id from public.timetable_slots where teacher_allocation_id=(select id from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001') and cycle_code='Z')
  )$$,
  'school admin can cancel an active timetable slot without deleting it'
);

select is(
  (select status from public.timetable_slots where teacher_allocation_id=(select id from public.teacher_allocations where staff_member_id='fdf10000-0000-4000-8000-000000000001' and subject_offering_id='fdf40000-0000-4000-8000-000000000001') and cycle_code='Z'),
  'cancelled',
  'cancelled timetable slot remains stored as history'
);

select is(
  (select count(*)::integer from public.audit_events where actor_user_id='fdf00000-0000-4000-8000-000000000001' and event_type in ('timetable.teacher_allocation.period_corrected','timetable.slot.cancelled')),
  2,
  'allocation correction and slot cancellation both produce audit events'
);

select * from finish();
rollback;
