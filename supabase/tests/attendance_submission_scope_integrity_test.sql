begin;

select plan(12);

insert into auth.users(id)
values ('aa000000-0000-4000-8000-000000000001');

insert into public.tenants(id,name,slug)
values
  ('aa100000-0000-4000-8000-000000000001','Attendance Scope Tenant A','attendance-scope-tenant-a'),
  ('aa100000-0000-4000-8000-000000000002','Attendance Scope Tenant B','attendance-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('aa110000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','Attendance Scope School A','ATT-SCOPE-A','Khomas','Windhoek'),
  ('aa110000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','Attendance Scope School B','ATT-SCOPE-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  'aa100000-0000-4000-8000-000000000001',
  'aa110000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'school_admin',
  '2026-01-01'
);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('aa120000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'8','Grade 8'),
  ('aa120000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002',2026,'8','Grade 8');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values
  ('aa130000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001',2026,'8A','Grade 8 A'),
  ('aa130000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000002',2026,'8A','Grade 8 A');

insert into public.staff_members(id,tenant_id,first_name,last_name)
values
  ('aa140000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','Teacher','One'),
  ('aa140000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','Teacher','Two');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values
  ('aa150000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','MATH','Mathematics'),
  ('aa150000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002','MATH','Mathematics');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id)
values
  ('aa160000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa150000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001'),
  ('aa160000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002',2026,'aa150000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000002');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values
  ('aa170000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa160000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','aa140000-0000-4000-8000-000000000001','2026-01-01'),
  ('aa170000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002',2026,'aa160000-0000-4000-8000-000000000002','aa130000-0000-4000-8000-000000000002','aa140000-0000-4000-8000-000000000002','2026-01-01');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name)
values
  ('aa180000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,1,'Period 1'),
  ('aa180000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002',2026,1,'Period 1');

insert into public.timetable_slots(id,tenant_id,school_id,academic_year,weekday,period_id,register_class_id,teacher_allocation_id)
values
  ('aa190000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,1,'aa180000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','aa170000-0000-4000-8000-000000000001'),
  ('aa190000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000002',2026,1,'aa180000-0000-4000-8000-000000000002','aa130000-0000-4000-8000-000000000002','aa170000-0000-4000-8000-000000000002');

select throws_ok(
  $$insert into public.attendance_register_submissions(tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001',2026,'aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'Daily attendance submission scope mismatch: school does not belong to tenant',
  'daily submission tenant must match school tenant'
);

select throws_ok(
  $$insert into public.attendance_register_submissions(tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa130000-0000-4000-8000-000000000002','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'Daily attendance submission scope mismatch: register class does not match tenant, school, and academic year',
  'daily submission class must match tenant school and year'
);

select lives_ok(
  $$insert into public.attendance_register_submissions(id,tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aaa00000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'valid daily attendance submission remains allowed'
);

select lives_ok(
  $$insert into public.attendance_register_submissions(id,tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,source,replaces_submission_id)
    values('aaa00000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online','aaa00000-0000-4000-8000-000000000001')$$,
  'daily replacement may reference the same attendance scope'
);

select throws_ok(
  $$insert into public.attendance_register_submissions(id,tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,source,replaces_submission_id)
    values('aaa00000-0000-4000-8000-000000000003','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa130000-0000-4000-8000-000000000001','2026-09-02','present','aa000000-0000-4000-8000-000000000001','online','aaa00000-0000-4000-8000-000000000001')$$,
  'Daily attendance replacement scope mismatch',
  'daily replacement cannot cross attendance date scope'
);

select throws_ok(
  $$insert into public.subject_attendance_submissions(tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aa100000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'Subject attendance submission scope mismatch: school does not belong to tenant',
  'subject submission tenant must match school tenant'
);

select throws_ok(
  $$insert into public.subject_attendance_submissions(tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000002','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'Subject attendance submission scope mismatch: register class does not match tenant, school, and academic year',
  'subject submission class must match tenant school and year'
);

select throws_ok(
  $$insert into public.subject_attendance_submissions(tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000002','aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'Subject attendance submission scope mismatch: timetable slot does not match tenant, school, academic year, and register class',
  'subject submission slot must match tenant school year and class'
);

select lives_ok(
  $$insert into public.subject_attendance_submissions(id,tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source)
    values('aab00000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online')$$,
  'valid subject attendance submission remains allowed'
);

select lives_ok(
  $$insert into public.subject_attendance_submissions(id,tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source,replaces_submission_id)
    values('aab00000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','2026-09-01','present','aa000000-0000-4000-8000-000000000001','online','aab00000-0000-4000-8000-000000000001')$$,
  'subject replacement may reference the same attendance scope'
);

select throws_ok(
  $$insert into public.subject_attendance_submissions(id,tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,default_status,recorded_by_user_id,source,replaces_submission_id)
    values('aab00000-0000-4000-8000-000000000003','aa100000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',2026,'aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','2026-09-02','present','aa000000-0000-4000-8000-000000000001','online','aab00000-0000-4000-8000-000000000001')$$,
  'Subject attendance replacement scope mismatch',
  'subject replacement cannot cross attendance date scope'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_daily_attendance_submission_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_daily_attendance_submission_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_subject_attendance_submission_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_subject_attendance_submission_scope_integrity()','EXECUTE'),
  'attendance submission integrity helpers remain private from clients'
);

select * from finish();
rollback;
