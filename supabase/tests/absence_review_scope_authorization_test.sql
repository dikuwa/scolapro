begin;

select plan(15);

-- Isolated actors for the canonical demo school.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('ab500000-0000-4000-8000-000000000001','absence-admin@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000002','absence-class@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000003','absence-subject@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000004','absence-hod@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000005','absence-counsellor@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000006','absence-other-school@example.test','authenticated','authenticated',now(),now()),
('ab500000-0000-4000-8000-000000000007','absence-other-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('ab510000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ab500000-0000-4000-8000-000000000002','ABS-CT','Class','Teacher','active'),
('ab510000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ab500000-0000-4000-8000-000000000003','ABS-ST','Subject','Teacher','active'),
('ab510000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ab500000-0000-4000-8000-000000000004','ABS-HOD','Scope','Hod','active'),
('ab510000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','ab500000-0000-4000-8000-000000000007','ABS-OT','Other','Teacher','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('ab520000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab510000-0000-4000-8000-000000000002','teacher','2026-01-01','ab500000-0000-4000-8000-000000000001'),
('ab520000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab510000-0000-4000-8000-000000000003','teacher','2026-01-01','ab500000-0000-4000-8000-000000000001'),
('ab520000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab510000-0000-4000-8000-000000000004','teacher','2026-01-01','ab500000-0000-4000-8000-000000000001'),
('ab520000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab510000-0000-4000-8000-000000000007','teacher','2026-01-01','ab500000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('ab530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000001',null,'school_admin','2026-01-01'),
('ab530000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000002','ab510000-0000-4000-8000-000000000002','class_teacher','2026-01-01'),
('ab530000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000003','ab510000-0000-4000-8000-000000000003','teacher','2026-01-01'),
('ab530000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000004','ab510000-0000-4000-8000-000000000004','hod','2026-01-01'),
('ab530000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000005',null,'counsellor','2026-01-01'),
('ab530000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab500000-0000-4000-8000-000000000007','ab510000-0000-4000-8000-000000000007','teacher','2026-01-01');

update public.register_classes
set register_teacher_staff_id='ab510000-0000-4000-8000-000000000002'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
('ab540000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ABS-A','Absence Scope A'),
('ab540000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ABS-B','Absence Scope B'),
('ab540000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ABS-C','Absence Scope C');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle) values
('ab550000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab540000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1),
('ab550000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab540000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',1),
('ab550000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab540000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010',1);

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
('ab560000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab550000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ab510000-0000-4000-8000-000000000003','2026-01-01'),
('ab560000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab550000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','ab510000-0000-4000-8000-000000000004','2026-01-01'),
('ab560000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ab550000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001b','ab510000-0000-4000-8000-000000000007','2026-01-01');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at) values
('ab570000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,11,'Absence Scope 1','08:00','08:40'),
('ab570000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,12,'Absence Scope 2','08:45','09:25'),
('ab570000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,13,'Absence Scope 3','09:30','10:10');

insert into public.timetable_slots(id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status) values
('ab580000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ABSCOPE',1,'ab570000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ab560000-0000-4000-8000-000000000001','active'),
('ab580000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ABSCOPE',2,'ab570000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001b','ab560000-0000-4000-8000-000000000002','active'),
('ab580000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ABSCOPE',3,'ab570000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001b','ab560000-0000-4000-8000-000000000003','active');

-- Leadership: school-wide classes and subject slots.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='daily_class'),2,'school admin receives both school register classes');
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot' and scope_id in ('ab580000-0000-4000-8000-000000000001','ab580000-0000-4000-8000-000000000002','ab580000-0000-4000-8000-000000000003')),3,'school admin receives school subject-period scope');

-- Class teacher: assigned register class only; no unrelated daily and no subject scope without an allocation.
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000002',true);
select ok(exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='daily_class' and scope_id='40000000-0000-4000-8000-00000000001a'),'class teacher sees assigned register class daily absences');
select ok(not exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='daily_class' and scope_id='40000000-0000-4000-8000-00000000001b'),'class teacher cannot see unrelated register class daily absences');
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot'),0,'class-teacher role alone does not grant class-wide subject-period scope');

-- Subject teacher: only explicitly allocated period scope; allocation does not grant daily class scope.
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000003',true);
select ok(exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot' and scope_id='ab580000-0000-4000-8000-000000000001'),'subject teacher sees allocated subject-period slot');
select ok(not exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot' and scope_id='ab580000-0000-4000-8000-000000000003'),'subject teacher cannot see another teacher subject-period slot');
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot'),1,'subject teacher receives only the explicitly allocated subject-period scope');
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='daily_class'),0,'teaching a subject in a class does not grant its daily absence list');

-- HOD: no inferred school/department authority; only explicit own teaching allocation.
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000004',true);
select ok(exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot' and scope_id='ab580000-0000-4000-8000-000000000002'),'HOD sees explicitly allocated subject-period slot');
select ok(not exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='subject_slot' and scope_id='ab580000-0000-4000-8000-000000000001'),'HOD cannot see unrelated subject/class allocation');
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind='daily_class'),0,'HOD does not receive school-wide daily absenteeism');

-- Counsellor review role is deliberately not an attendance-scope grant.
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30')),0,'counsellor does not receive unrestricted daily or subject-period scope');
select ok(not exists(select 1 from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30') where scope_kind not in ('daily_class','subject_slot')),'guardian review authority yields no evidence or correction scope');

-- A membership at another school never authorizes this school.
insert into public.schools(id,tenant_id,name,status) values('ab590000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence Other School','active');
insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values('ab530000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','ab590000-0000-4000-8000-000000000001','ab500000-0000-4000-8000-000000000006','school_admin','2026-01-01');
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000006',true);
select is((select count(*)::int from public.resolve_absence_review_scope('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-30')),0,'another-school administrator receives no target-school absence scope');

select * from finish();
rollback;
