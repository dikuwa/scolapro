begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fcc00000-0000-4000-8000-000000000001','cycle-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcc00000-0000-4000-8000-000000000002','cycle-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcc00000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcc00000-0000-4000-8000-000000000002','principal',current_date-1);

select is(
  (select timetable_cycle_mode || ':' || timetable_cycle_length::text from public.schools where id='22222222-2222-4222-8222-222222222222'),
  'weekday:5',
  'existing schools default to a five-day standard week'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$select public.update_school_timetable_cycle('22222222-2222-4222-8222-222222222222','rotating',10::smallint)$$,
  'principal may self-serve the school timetable day workflow'
);
reset role;

select is(
  (select timetable_cycle_mode || ':' || timetable_cycle_length::text from public.schools where id='22222222-2222-4222-8222-222222222222'),
  'rotating:10',
  'rotating ten-day cycle is stored on the school'
);

select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.update_school_timetable_cycle('22222222-2222-4222-8222-222222222222','weekday',8::smallint)$$,
  'Standard weekday timetable cycles cannot exceed 7 days',
  'weekday mode cannot be configured above seven days'
);
reset role;

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('fcc10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','CYCLE-001','Cycle','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'fcc11000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fcc10000-0000-4000-8000-000000000001',
  'teacher',current_date-1,null,
  'fcc00000-0000-4000-8000-000000000001'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fcc20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','CYCLE','Cycle Subject','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
select
  'fcc30000-0000-4000-8000-000000000001'::uuid,e.tenant_id,e.school_id,e.academic_year,
  'fcc20000-0000-4000-8000-000000000001'::uuid,e.grade_id,1,'active'
from public.enrolments e
where e.school_id='22222222-2222-4222-8222-222222222222'
  and e.status='current' and e.grade_id is not null and e.register_class_id is not null
order by e.created_at limit 1;

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period)
select 'fcc40000-0000-4000-8000-000000000001'::uuid,so.tenant_id,so.school_id,so.academic_year,30,'Cycle Test Period',true
from public.subject_offerings so where so.id='fcc30000-0000-4000-8000-000000000001';

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
select
  'fcc50000-0000-4000-8000-000000000001'::uuid,e.tenant_id,e.school_id,e.academic_year,
  'fcc30000-0000-4000-8000-000000000001'::uuid,e.register_class_id,
  'fcc10000-0000-4000-8000-000000000001'::uuid,current_date
from public.enrolments e
where e.school_id='22222222-2222-4222-8222-222222222222'
  and e.status='current' and e.register_class_id is not null
order by e.created_at limit 1;

select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.teacher_allocations where id='fcc50000-0000-4000-8000-000000000001'),
    'R',10::smallint,'fcc40000-0000-4000-8000-000000000001',
    (select register_class_id from public.teacher_allocations where id='fcc50000-0000-4000-8000-000000000001'),
    'fcc50000-0000-4000-8000-000000000001',null
  )$$,
  'Day 10 slot is accepted for a ten-day rotating cycle'
);

select throws_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222',
    (select academic_year from public.teacher_allocations where id='fcc50000-0000-4000-8000-000000000001'),
    'R',11::smallint,'fcc40000-0000-4000-8000-000000000001',
    (select register_class_id from public.teacher_allocations where id='fcc50000-0000-4000-8000-000000000001'),
    'fcc50000-0000-4000-8000-000000000001',null
  )$$,
  'Day 11 is outside this school''s configured timetable cycle',
  'slot creation rejects a day outside the configured school cycle'
);
reset role;

select throws_ok(
  $$update public.schools set timetable_cycle_length=5 where id='22222222-2222-4222-8222-222222222222'$$,
  'Timetable cycle cannot be shortened below Day 10 while active slots still use that day',
  'cycle cannot be shortened beneath an active timetable day'
);

update public.timetable_slots
set status='cancelled'
where id=(select id from public.timetable_slots where teacher_allocation_id='fcc50000-0000-4000-8000-000000000001' and weekday=10 limit 1);

select lives_ok(
  $$update public.schools set timetable_cycle_length=5 where id='22222222-2222-4222-8222-222222222222'$$,
  'cycle may be shortened once no active slot uses the removed days'
);

select throws_ok(
  $$insert into public.timetable_slots(
      tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id
    ) select
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',academic_year,'R',6,
      'fcc40000-0000-4000-8000-000000000001',register_class_id,'fcc50000-0000-4000-8000-000000000001'
    from public.teacher_allocations where id='fcc50000-0000-4000-8000-000000000001'$$,
  'Day 6 is outside this school''s configured timetable cycle',
  'physical trigger blocks direct writes beyond the configured cycle length'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.timetable_slots'::regclass and conname='timetable_slots_weekday_check')
  and exists(select 1 from pg_trigger where tgrelid='public.timetable_slots'::regclass and tgname='timetable_slot_cycle_day_trg' and not tgisinternal),
  'widened day constraint and per-school physical guard are installed'
);

select * from finish();
rollback;
