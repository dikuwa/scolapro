begin;

select plan(14);

update public.schools
set timetable_cycle_mode='weekday',timetable_cycle_length=7
where id='22222222-2222-4222-8222-222222222222';

insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',current_date,true,'issue 1214 fixture','school'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',current_date+1,false,'issue 1214 forged date','school')
on conflict (school_id,school_date) do update set is_school_day=excluded.is_school_day,reason=excluded.reason;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('12140000-0000-4000-8000-000000000001','1214-register@example.test','authenticated','authenticated',now(),now()),
  ('12140000-0000-4000-8000-000000000002','1214-subject@example.test','authenticated','authenticated',now(),now()),
  ('12140000-0000-4000-8000-000000000003','1214-hod@example.test','authenticated','authenticated',now(),now()),
  ('12140000-0000-4000-8000-000000000004','1214-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('12141000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','12140000-0000-4000-8000-000000000001','ISS1214-R','Register','Teacher','active'),
  ('12141000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','12140000-0000-4000-8000-000000000002','ISS1214-S','Subject','Teacher','active'),
  ('12141000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','12140000-0000-4000-8000-000000000003','ISS1214-H','Unassigned','HOD','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
  ('12142000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12141000-0000-4000-8000-000000000001','teacher',current_date-30,'12140000-0000-4000-8000-000000000004'),
  ('12142000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12141000-0000-4000-8000-000000000002','teacher',current_date-30,'12140000-0000-4000-8000-000000000004'),
  ('12142000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12141000-0000-4000-8000-000000000003','hod',current_date-30,'12140000-0000-4000-8000-000000000004');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12140000-0000-4000-8000-000000000001','12141000-0000-4000-8000-000000000001','class_teacher',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12140000-0000-4000-8000-000000000002','12141000-0000-4000-8000-000000000002','teacher',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12140000-0000-4000-8000-000000000003','12141000-0000-4000-8000-000000000003','hod',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','12140000-0000-4000-8000-000000000004',null,'school_admin',current_date-30);

update public.register_classes
set register_teacher_staff_id='12141000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
  ('12143000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ISS1214','Issue 1214 Subject');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle) values
  ('12144000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'12143000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1);
insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
  ('12145000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'12144000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','12141000-0000-4000-8000-000000000002',current_date-30);
insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period) values
  ('12146000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,26,'Issue 1214 teaching period',true),
  ('12146000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,27,'Issue 1214 non-teaching period',false);
insert into public.timetable_slots(id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status) values
  ('12147000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ISS1214',extract(isodow from current_date)::smallint,'12146000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','12145000-0000-4000-8000-000000000001','active'),
  ('12147000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ISS1214',extract(isodow from current_date)::smallint,'12146000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','12145000-0000-4000-8000-000000000001','active');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','12140000-0000-4000-8000-000000000001',true);
select ok(app_private.can_record_register_class('40000000-0000-4000-8000-00000000001a'),'assigned register teacher can capture assigned class');
select is(app_private.can_record_register_class('40000000-0000-4000-8000-00000000001b'),false,'assigned register teacher cannot capture another class');

select set_config('request.jwt.claim.sub','12140000-0000-4000-8000-000000000002',true);
select is(app_private.can_record_register_class('40000000-0000-4000-8000-00000000001a'),false,'subject allocation does not grant official register capture');
select ok(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000001',current_date),'allocated teacher can capture exact subject period');
select is(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000002',current_date),false,'non-teaching period cannot capture subject attendance');
select is(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000001',current_date+1),false,'non-teaching forged date is denied');

select set_config('request.jwt.claim.sub','12140000-0000-4000-8000-000000000001',true);
select is(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000001',current_date),false,'register teacher cannot capture another teacher subject period');

select set_config('request.jwt.claim.sub','12140000-0000-4000-8000-000000000003',true);
select is(app_private.can_record_register_class('40000000-0000-4000-8000-00000000001a'),false,'unassigned HOD has no broad register write authority');
select is(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000001',current_date),false,'unassigned HOD has no broad subject-period write authority');

select set_config('request.jwt.claim.sub','12140000-0000-4000-8000-000000000004',true);
select ok(app_private.can_record_register_class('40000000-0000-4000-8000-00000000001b'),'school admin retains governed register correction authority');
select ok(app_private.can_record_subject_attendance('12147000-0000-4000-8000-000000000001',current_date),'school admin retains governed subject correction authority');

insert into public.learner_subject_registrations(id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id) values
  ('12148000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','12144000-0000-4000-8000-000000000001','active','test','12140000-0000-4000-8000-000000000004');
insert into public.teaching_groups(id,tenant_id,school_id,academic_year,subject_offering_id,code,name,status,effective_from,created_by_user_id) values
  ('12149000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'12144000-0000-4000-8000-000000000001','ISS1214-G','Issue 1214 Group','active',current_date-30,'12140000-0000-4000-8000-000000000004');
insert into public.teaching_group_allocations(id,tenant_id,school_id,academic_year,teaching_group_id,teacher_allocation_id,effective_from,source,created_by_user_id) values
  ('1214a000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'12149000-0000-4000-8000-000000000001','12145000-0000-4000-8000-000000000001',current_date-30,'test','12140000-0000-4000-8000-000000000004');

select is(app_private.subject_attendance_enrolment_in_scope('12147000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date),false,'learner outside allocated teaching group is denied');

insert into public.teaching_group_memberships(id,tenant_id,school_id,academic_year,teaching_group_id,enrolment_id,learner_id,effective_from,source,created_by_user_id) values
  ('1214b000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'12149000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date-30,'test','12140000-0000-4000-8000-000000000004');

select ok(app_private.subject_attendance_enrolment_in_scope('12147000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date),'learner in allocated teaching group remains compatible');
select is(app_private.subject_attendance_enrolment_in_scope('12147000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',current_date),false,'learner from another register class cannot enter the period roster');

select * from finish();
rollback;
