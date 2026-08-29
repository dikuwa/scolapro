begin;

select plan(5);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','TT-STAFF-001','Same','Teacher','active'),
  ('fb300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','TT-STAFF-002','Other','Teacher','active');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values
  ('fb310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-A','Timetable A'),
  ('fb310000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-B','Timetable B');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle)
values
  ('fb320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb310000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',3),
  ('fb320000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb310000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',3);

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values
  ('fb330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb320000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fb300000-0000-4000-8000-000000000001','2026-01-01'),
  ('fb330000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb320000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','fb300000-0000-4000-8000-000000000001','2026-01-01'),
  ('fb330000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb320000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','fb300000-0000-4000-8000-000000000002','2026-01-01');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at)
values
  ('fb340000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,21,'Conflict P1','08:00','08:45'),
  ('fb340000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,22,'Conflict P2','08:45','09:30');

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,status)
values('fb350000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TT-R1','Timetable Room 1','active');

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,room_id,status
) values(
  'fb360000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',1,'fb340000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fb330000-0000-4000-8000-000000000001','fb350000-0000-4000-8000-000000000001','active'
);

select throws_ok(
  $$insert into public.timetable_slots(tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',1,'fb340000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000002','active')$$,
  '23505',null,
  'same staff member cannot be double-booked through two different teacher allocations'
);

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status
) values(
  'fb360000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',1,'fb340000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000002','cancelled'
);

select lives_ok(
  $$insert into public.timetable_slots(tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',1,'fb340000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000002','active')$$,
  'cancelled timetable history does not block an active replacement slot for the class'
);

select throws_ok(
  $$insert into public.timetable_slots(tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,room_id,status) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',1,'fb340000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000003','fb350000-0000-4000-8000-000000000001','active')$$,
  '23505',null,
  'same room cannot be double-booked even through direct timetable table writes'
);

select throws_ok(
  $$insert into public.timetable_slots(tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',2,'fb340000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000001','active')$$,
  '23514',null,
  'timetable slot cannot pair a teacher allocation with a different register class'
);

select lives_ok(
  $$insert into public.timetable_slots(tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,room_id,status) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'A',2,'fb340000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fb330000-0000-4000-8000-000000000003','fb350000-0000-4000-8000-000000000001','active')$$,
  'teacher and room remain available in a different timetable day'
);

select * from finish();
rollback;