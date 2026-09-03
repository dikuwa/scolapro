begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd500000-0000-4000-8000-000000000001','observation-allocation@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values(
  'fd510000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fd500000-0000-4000-8000-000000000001',
  'OBS-ALLOC-001','Allocated','Teacher','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'fd520000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd510000-0000-4000-8000-000000000001',
  'teacher',current_date-30,null,
  'fd500000-0000-4000-8000-000000000001'
);

-- Use the seeded learner/class and any active offering for that class grade/year so
-- this regression exercises the real teacher-allocation relationship without
-- hard-coding an offering id.
insert into public.teacher_allocations(
  tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
)
select
  e.tenant_id,e.school_id,e.academic_year,so.id,e.register_class_id,
  'fd510000-0000-4000-8000-000000000001'::uuid,current_date-10
from public.enrolments e
join public.subject_offerings so
  on so.school_id=e.school_id
 and so.academic_year=e.academic_year
 and so.grade_id=e.grade_id
 and so.status='active'
where e.learner_id='50000000-0000-4000-8000-000000000001'::uuid
  and e.school_id='22222222-2222-4222-8222-222222222222'::uuid
  and e.status='current'
  and e.register_class_id is not null
order by so.id
limit 1;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000001',true);

select ok(
  exists(select 1 from public.teacher_allocations where staff_member_id='fd510000-0000-4000-8000-000000000001'),
  'teacher allocation fixture remains present'
);

select is(
  app_private.staff_member_has_school_assignment(
    'fd510000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    current_date
  ),
  true,
  'allocated teacher has current governed school placement before departure'
);

select is(
  app_private.can_access_learner_observations(
    '22222222-2222-4222-8222-222222222222',
    '50000000-0000-4000-8000-000000000001'
  ),
  true,
  'active teacher allocation grants observation access while placement is current'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='fd520000-0000-4000-8000-000000000001';

select is(
  app_private.staff_member_has_school_assignment(
    'fd510000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    current_date
  ),
  false,
  'school placement ends independently of the historical teacher allocation'
);

select is(
  app_private.can_access_learner_observations(
    '22222222-2222-4222-8222-222222222222',
    '50000000-0000-4000-8000-000000000001'
  ),
  false,
  'open teacher allocation no longer grants learner observation access after placement ends'
);

select * from finish();
rollback;
