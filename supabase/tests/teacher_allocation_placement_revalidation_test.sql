begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdf00000-0000-4000-8000-000000000001','allocation-revalidation-admin@example.test','authenticated','authenticated',now(),now()),
  ('fdf00000-0000-4000-8000-000000000002','allocation-revalidation-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdf00000-0000-4000-8000-000000000001','school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values(
  'fdf10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'ALLOC-REVALIDATE-001','Lifecycle','Teacher','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values(
  'fdf20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdf10000-0000-4000-8000-000000000001','teacher','Teacher',
  current_date-30,current_date+60,
  'fdf00000-0000-4000-8000-000000000001'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values(
  'fdf30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ALLOC-REVALIDATE','Allocation Revalidation Fixture','active'
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

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdf00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_teacher_allocation_period(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.subject_offerings where id='fdf40000-0000-4000-8000-000000000001'),
    'fdf40000-0000-4000-8000-000000000001',
    (select register_class_id from public.enrolments where learner_id='50000000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222' and status='current' and register_class_id is not null order by created_at limit 1),
    'fdf10000-0000-4000-8000-000000000001',current_date-30,current_date+60
  )$$,
  'teacher allocation can be created while the staff assignment covers its full live period'
);

select throws_ok(
  $$update public.staff_school_assignments
    set effective_to=current_date+10
    where id='fdf20000-0000-4000-8000-000000000001'$$,
  'Staff placement change would leave a current or future teacher allocation uncovered',
  'shortening the last covering staff assignment is rejected while a live allocation extends beyond it'
);

select is(
  (select effective_to from public.staff_school_assignments where id='fdf20000-0000-4000-8000-000000000001'),
  current_date+60,
  'rejected placement shortening rolls back and preserves the original assignment end'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdf00000-0000-4000-8000-000000000002',
  'fdf10000-0000-4000-8000-000000000001','teacher',current_date-30,current_date+90
);

select lives_ok(
  $$update public.staff_school_assignments
    set effective_to=current_date+10
    where id='fdf20000-0000-4000-8000-000000000001'$$,
  'placement may be shortened when an alternate staff-linked school membership still covers the allocation'
);

select throws_ok(
  $$delete from public.school_memberships
    where user_id='fdf00000-0000-4000-8000-000000000002'
      and school_id='22222222-2222-4222-8222-222222222222'$$,
  'Staff placement change would leave a current or future teacher allocation uncovered',
  'removing the alternate covering membership is rejected while the shortened assignment cannot cover the allocation'
);

select throws_ok(
  $$update public.staff_members set status='inactive'
    where id='fdf10000-0000-4000-8000-000000000001'$$,
  'Staff member cannot be deactivated while current or future teacher allocations remain',
  'staff identity cannot be deactivated while a live teacher allocation remains'
);

update public.teacher_allocations
set active_to=current_date-1
where staff_member_id='fdf10000-0000-4000-8000-000000000001';

select lives_ok(
  $$update public.staff_members set status='inactive'
    where id='fdf10000-0000-4000-8000-000000000001'$$,
  'ended historical teacher allocations do not block later staff deactivation'
);

select * from finish();
rollback;
