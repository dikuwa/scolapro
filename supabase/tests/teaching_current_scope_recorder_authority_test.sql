begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ee000000-0000-4000-8000-000000000001','teaching-noncurrent@example.test','authenticated','authenticated',now(),now()),
  ('ee000000-0000-4000-8000-000000000002','teaching-current@example.test','authenticated','authenticated',now(),now()),
  ('ee000000-0000-4000-8000-000000000003','teaching-support@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('ee100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Teaching Other School','TEACH-OTHER','Erongo','Walvis Bay','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ee110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ee000000-0000-4000-8000-000000000001','TEACH-NC','Noncurrent','Teacher','active'),
  ('ee110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ee000000-0000-4000-8000-000000000002','TEACH-CUR','Current','Teacher','active');

-- User 1 still belongs to the teaching school, but the newer effective membership
-- makes another active school deterministic current school. User 2 has only the
-- teaching school as current context; its membership is deliberately not staff-linked
-- so the explicit staff_school_assignments row remains the governed placement source.
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('ee120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee000000-0000-4000-8000-000000000001','ee110000-0000-4000-8000-000000000001','teacher',current_date-30,null),
  ('ee120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001',null,'teacher',current_date-1,null),
  ('ee120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee000000-0000-4000-8000-000000000002',null,'teacher',current_date-10,null);

insert into public.platform_memberships(user_id,role_key,active_from)
values('ee000000-0000-4000-8000-000000000003','platform_support',current_date-10);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('ee130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee110000-0000-4000-8000-000000000001','teacher',current_date-30,null,'ee000000-0000-4000-8000-000000000001'),
  ('ee130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee110000-0000-4000-8000-000000000002','teacher',current_date-30,null,'ee000000-0000-4000-8000-000000000002');

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
) values
  ('ee140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ee141000-0000-4000-8000-000000000001','ee142000-0000-4000-8000-000000000001','ee110000-0000-4000-8000-000000000001',current_date-30,null),
  ('ee140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ee141000-0000-4000-8000-000000000001','ee142000-0000-4000-8000-000000000001','ee110000-0000-4000-8000-000000000002',current_date-30,null);

insert into public.teaching_schedule_items(
  id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status
) values
  ('ee150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ee151000-0000-4000-8000-000000000001','ee142000-0000-4000-8000-000000000001','ee140000-0000-4000-8000-000000000001',current_date,1,'planned'),
  ('ee150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ee151000-0000-4000-8000-000000000002','ee142000-0000-4000-8000-000000000001','ee140000-0000-4000-8000-000000000002',current_date,1,'planned');

set local session_replication_role = origin;

select throws_ok(
  $$insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id)
    values('ee160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000001',current_date,'ee000000-0000-4000-8000-000000000001')$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'another active non-current school cannot supply lesson-preparation authority'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('ee170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000001',current_date,'taught','ee000000-0000-4000-8000-000000000001')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'another active non-current school cannot supply teaching-actual recorder authority'
);

select lives_ok(
  $$insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id)
    values('ee160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'ee000000-0000-4000-8000-000000000002')$$,
  'current allocated teacher with governed placement can prepare lesson'
);

select lives_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('ee170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'taught','ee000000-0000-4000-8000-000000000002')$$,
  'current allocated teacher with governed placement can record teaching actual'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='ee130000-0000-4000-8000-000000000002';

select throws_ok(
  $$insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id)
    values('ee160000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'ee000000-0000-4000-8000-000000000002')$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'ended governed placement removes lesson-preparation authority'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('ee170000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'taught','ee000000-0000-4000-8000-000000000002')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'ended governed placement removes teaching-actual recorder authority'
);

update public.staff_school_assignments
set effective_to=null
where id='ee130000-0000-4000-8000-000000000002';
update public.teacher_allocations
set active_to=current_date-1
where id='ee140000-0000-4000-8000-000000000002';

select throws_ok(
  $$insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id)
    values('ee160000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'ee000000-0000-4000-8000-000000000002')$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'stale teacher allocation cannot supply lesson-preparation authority'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('ee170000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'taught','ee000000-0000-4000-8000-000000000002')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'stale teacher allocation cannot supply teaching-actual recorder authority'
);

select throws_ok(
  $$insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id)
    values('ee160000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'ee000000-0000-4000-8000-000000000003')$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'Platform Support cannot author lesson preparation'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('ee170000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee150000-0000-4000-8000-000000000002',current_date,'taught','ee000000-0000-4000-8000-000000000003')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'Platform Support cannot record teaching actual'
);

select throws_ok(
  $$update public.lesson_preparations set prepared_by_user_id='ee000000-0000-4000-8000-000000000003' where id='ee160000-0000-4000-8000-000000000002'$$,
  'Lesson preparation root scope and provenance are immutable',
  'lesson preparation author provenance remains immutable'
);

select throws_ok(
  $$update public.teaching_actuals set recorded_by_user_id='ee000000-0000-4000-8000-000000000003' where id='ee170000-0000-4000-8000-000000000002'$$,
  'Teaching actual root scope and provenance are immutable',
  'teaching actual recorder provenance remains immutable'
);

select * from finish();
rollback;
