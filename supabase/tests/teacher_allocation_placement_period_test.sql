begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fde00000-0000-4000-8000-000000000001','allocation-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fde00000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ALLOC-PERIOD-001','Current','Teacher','active'),
  ('fde10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ALLOC-PERIOD-002','Incoming','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  (
    'fde20000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'fde10000-0000-4000-8000-000000000001','teacher','Teacher',current_date-30,current_date+30,
    'fde00000-0000-4000-8000-000000000001'
  ),
  (
    'fde20000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'fde10000-0000-4000-8000-000000000002','teacher','Teacher',current_date+31,null,
    'fde00000-0000-4000-8000-000000000001'
  );

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values(
  'fde30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'ALLOC-PERIOD','Allocation Period Fixture','active'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
)
select
  'fde40000-0000-4000-8000-000000000001'::uuid,
  e.tenant_id,e.school_id,e.academic_year,
  'fde30000-0000-4000-8000-000000000001'::uuid,e.grade_id,1,'active'
from public.enrolments e
where e.learner_id='50000000-0000-4000-8000-000000000001'::uuid
  and e.school_id='22222222-2222-4222-8222-222222222222'::uuid
  and e.status='current'
  and e.register_class_id is not null
order by e.created_at
limit 1;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_teacher_allocation(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fde40000-0000-4000-8000-000000000001'),
    'fde40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fde10000-0000-4000-8000-000000000001'
  )$$,
  'existing allocation RPC remains compatible for a currently placed teacher'
);

select is(
  (select active_to from public.teacher_allocations where staff_member_id='fde10000-0000-4000-8000-000000000001' and subject_offering_id='fde40000-0000-4000-8000-000000000001'),
  current_date+30,
  'existing RPC bounds a new allocation to the finite current staff placement end'
);

select lives_ok(
  $$select public.create_teacher_allocation_period(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fde40000-0000-4000-8000-000000000001'),
    'fde40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fde10000-0000-4000-8000-000000000002',
    current_date+31,null
  )$$,
  'dated allocation RPC can pre-plan an incoming teacher after their future placement starts'
);

select is(
  (select active_from from public.teacher_allocations where staff_member_id='fde10000-0000-4000-8000-000000000002' and subject_offering_id='fde40000-0000-4000-8000-000000000001'),
  current_date+31,
  'future handover allocation preserves its requested effective start date'
);

select is(
  (select active_to from public.teacher_allocations where staff_member_id='fde10000-0000-4000-8000-000000000002' and subject_offering_id='fde40000-0000-4000-8000-000000000001'),
  null::date,
  'open-ended future allocation is allowed when the incoming school placement is open-ended'
);

select throws_ok(
  $$select public.create_teacher_allocation_period(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fde40000-0000-4000-8000-000000000001'),
    'fde40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fde10000-0000-4000-8000-000000000002',
    current_date+20,current_date+25
  )$$,
  'Staff member placement does not cover teacher allocation period',
  'future teacher cannot be allocated before their governed school placement begins'
);

select throws_ok(
  $$insert into public.teacher_allocations(
    tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
  ) select
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',so.academic_year,
    so.id,e.register_class_id,'fde10000-0000-4000-8000-000000000001',current_date,null
  from public.subject_offerings so
  join public.enrolments e on e.school_id=so.school_id and e.academic_year=so.academic_year
  where so.id='fde40000-0000-4000-8000-000000000001'
    and e.learner_id='50000000-0000-4000-8000-000000000001'
    and e.status='current' and e.register_class_id is not null
  limit 1$$,
  'Teacher allocation period must be covered by an active staff school placement',
  'physical integrity guard blocks a direct open-ended allocation beyond finite staff placement'
);

select * from finish();
rollback;
