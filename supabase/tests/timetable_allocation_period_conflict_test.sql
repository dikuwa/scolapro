begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdc00000-0000-4000-8000-000000000001','timetable-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdc00000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fdc10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','TT-PERIOD-A','Teacher','Alpha','active'),
  ('fdc10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','TT-PERIOD-B','Teacher','Beta','active'),
  ('fdc10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','TT-PERIOD-C','Teacher','Gamma','active');

-- These synthetic teachers exercise timetable overlap behavior. Give each teacher a
-- governed school placement that covers every allocation date used by this test so
-- placement validation does not mask the timetable-conflict assertions under test.
insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdc10000-0000-4000-8000-000000000001','teacher','Teacher','2026-01-01','2026-10-31','fdc00000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdc10000-0000-4000-8000-000000000002','teacher','Teacher','2026-10-15','2026-12-31','fdc00000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdc10000-0000-4000-8000-000000000003','teacher','Teacher','2026-10-15','2026-11-15','fdc00000-0000-4000-8000-000000000001');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values
  ('fdc20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-PERIOD-A','Timetable Period A','active'),
  ('fdc20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-PERIOD-B','Timetable Period B','active'),
  ('fdc20000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-PERIOD-C','Timetable Period C','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values
  ('fdc30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc20000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',3,'active'),
  ('fdc30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc20000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',3,'active'),
  ('fdc30000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc20000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010',3,'active');

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,
  staff_member_id,active_from,active_to
) values
  ('fdc40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc30000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fdc10000-0000-4000-8000-000000000001','2026-01-01','2026-10-31'),
  ('fdc40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc30000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','fdc10000-0000-4000-8000-000000000002','2026-11-01','2026-12-31'),
  ('fdc40000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdc30000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001b','fdc10000-0000-4000-8000-000000000003','2026-10-15','2026-11-15');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at)
values(
  'fdc50000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,30,'Handover Period','15:00','15:45'
);

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,status)
values(
  'fdc60000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'HANDOVER-R1','Handover Room','active'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222',2026,'H',1::smallint,
    'fdc50000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-00000000001a',
    'fdc40000-0000-4000-8000-000000000001',null
  )$$,
  'finite teacher allocation can create its recurring timetable slot'
);

select lives_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222',2026,'H',1::smallint,
    'fdc50000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-00000000001a',
    'fdc40000-0000-4000-8000-000000000002',null
  )$$,
  'future non-overlapping teacher handover can be pre-planned in the same class and period'
);

select is(
  (select count(*)::integer
   from public.timetable_slots
   where cycle_code='H' and weekday=1 and period_id='fdc50000-0000-4000-8000-000000000001'
     and register_class_id='40000000-0000-4000-8000-00000000001a' and status='active'),
  2,
  'both non-overlapping handover slots remain active as scheduled history/future state'
);

select lives_ok(
  $$select public.create_timetable_slot(
    '22222222-2222-4222-8222-222222222222',2026,'H',1::smallint,
    'fdc50000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-00000000001b',
    'fdc40000-0000-4000-8000-000000000003',null
  )$$,
  'another class may occupy the timetable position with a different teacher before room assignment'
);

select lives_ok(
  $$select public.assign_timetable_slot_room(
    (select id from public.timetable_slots where teacher_allocation_id='fdc40000-0000-4000-8000-000000000001' and cycle_code='H'),
    'fdc60000-0000-4000-8000-000000000001'
  )$$,
  'room can be assigned to first handover period'
);

select lives_ok(
  $$select public.assign_timetable_slot_room(
    (select id from public.timetable_slots where teacher_allocation_id='fdc40000-0000-4000-8000-000000000002' and cycle_code='H'),
    'fdc60000-0000-4000-8000-000000000001'
  )$$,
  'same room can be reused by the non-overlapping replacement allocation'
);

select throws_ok(
  $$select public.assign_timetable_slot_room(
    (select id from public.timetable_slots where teacher_allocation_id='fdc40000-0000-4000-8000-000000000003' and cycle_code='H'),
    'fdc60000-0000-4000-8000-000000000001'
  )$$,
  '23505',null,
  'room assignment rejects an allocation period that overlaps the existing handover bookings'
);

select lives_ok(
  $$insert into public.teacher_allocations(
    tenant_id,school_id,academic_year,subject_offering_id,register_class_id,
    staff_member_id,active_from,active_to
  ) values(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',2026,
    'fdc30000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-00000000001a',
    'fdc10000-0000-4000-8000-000000000003','2026-10-15','2026-11-15'
  )$$,
  'allocation creation itself remains independent of timetable conflicts'
);

select throws_ok(
  $$insert into public.timetable_slots(
    tenant_id,school_id,academic_year,cycle_code,weekday,period_id,
    register_class_id,teacher_allocation_id,status
  ) select
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',2026,'H',1::smallint,
    'fdc50000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-00000000001a',id,'active'
  from public.teacher_allocations
  where staff_member_id='fdc10000-0000-4000-8000-000000000003'
    and register_class_id='40000000-0000-4000-8000-00000000001a'
  order by created_at desc limit 1$$,
  '23505',null,
  'direct timetable write rejects an overlapping class allocation period'
);

select throws_ok(
  $$update public.teacher_allocations
    set active_from='2026-10-15'
    where id='fdc40000-0000-4000-8000-000000000002'$$,
  '23505',null,
  'later allocation-date edit cannot turn a valid handover into an overlapping timetable conflict'
);

select is(
  (select active_from from public.teacher_allocations where id='fdc40000-0000-4000-8000-000000000002'),
  '2026-11-01'::date,
  'rejected allocation overlap edit leaves the original future handover date intact'
);

select * from finish();
rollback;