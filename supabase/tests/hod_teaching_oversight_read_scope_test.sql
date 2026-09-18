begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe000000-0000-4000-8000-000000000001','oversight-hod@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','oversight-other-hod@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000003','oversight-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000004','oversight-other-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fe900000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Oversight Other School','OVERSIGHT-OTHER','Erongo','Swakopmund','active')
on conflict (id) do nothing;

set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000001','OV-H1','Hod','Assigned','active'),
  ('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000002','OV-H2','Hod','Other','active'),
  ('fe100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000003','OV-T','Teacher','Self','active'),
  ('fe100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000004','OV-X','Hod','OtherSchool','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('fe110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','hod',current_date-30),
  ('fe110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','hod',current_date-30),
  ('fe110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000003','teacher',current_date-30),
  ('fe110000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fe900000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000004','fe100000-0000-4000-8000-000000000004','hod',current_date-30);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
  ('fe120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','management',current_date-30,'fe000000-0000-4000-8000-000000000001'),
  ('fe120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000002','management',current_date-30,'fe000000-0000-4000-8000-000000000002'),
  ('fe120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000003','teacher',current_date-30,'fe000000-0000-4000-8000-000000000003'),
  ('fe120000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fe900000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000004','management',current_date-30,'fe000000-0000-4000-8000-000000000004');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
  ('fe130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','OV-A','Oversight A'),
  ('fe130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','OV-B','Oversight B');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id) values
  ('fe140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe130000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010'),
  ('fe140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe130000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
  ('fe150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe140000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fe100000-0000-4000-8000-000000000003',current_date-30),
  ('fe150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe140000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','fe100000-0000-4000-8000-000000000002',current_date-30);

insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,register_class_id,teacher_allocation_id,status,created_by_user_id) values
  ('fe160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe140000-0000-4000-8000-000000000001','fe161000-0000-4000-8000-000000000001','class','40000000-0000-4000-8000-00000000001a','fe150000-0000-4000-8000-000000000001','active','fe000000-0000-4000-8000-000000000001'),
  ('fe160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe140000-0000-4000-8000-000000000002','fe161000-0000-4000-8000-000000000002','class','40000000-0000-4000-8000-00000000001a','fe150000-0000-4000-8000-000000000002','active','fe000000-0000-4000-8000-000000000002');

insert into public.pacing_plan_items(id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods,sequence_number) values
  ('fe170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe160000-0000-4000-8000-000000000001','fe171000-0000-4000-8000-000000000001',2,1),
  ('fe170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe160000-0000-4000-8000-000000000002','fe171000-0000-4000-8000-000000000002',2,1);

insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status) values
  ('fe180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe170000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fe150000-0000-4000-8000-000000000001',current_date,1,'taught'),
  ('fe180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe170000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','fe150000-0000-4000-8000-000000000002',current_date,1,'planned');

insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id,status) values
  ('fe190000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe180000-0000-4000-8000-000000000001',current_date,'fe000000-0000-4000-8000-000000000003','submitted');

insert into public.preparation_submissions(id,tenant_id,school_id,academic_year,submitted_by_user_id,scope_kind,status) values
  ('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fe000000-0000-4000-8000-000000000003','selected_preparations','reviewed');

insert into public.preparation_submission_items(tenant_id,school_id,preparation_submission_id,lesson_preparation_id,preparation_status_snapshot)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe200000-0000-4000-8000-000000000001','fe190000-0000-4000-8000-000000000001','submitted');

insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,periods_used,coverage_state,reflection,recorded_by_user_id)
values('fe210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe180000-0000-4000-8000-000000000001',current_date,1,'taught','Lesson completed with revision needed','fe000000-0000-4000-8000-000000000003');

set local session_replication_role = origin;

insert into public.subject_department_responsibilities(tenant_id,school_id,subject_id,department_head_staff_assignment_id,effective_from,created_by_user_id)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001',current_date-30,'fe000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select array_agg(subject_id order by subject_id) from public.resolve_hod_teaching_oversight('22222222-2222-4222-8222-222222222222',2026)),
  array['fe130000-0000-4000-8000-000000000001'::uuid],
  'assigned HOD sees only the explicitly responsible subject'
);

select is(
  (select reviewed_preparation_count from public.resolve_hod_teaching_oversight('22222222-2222-4222-8222-222222222222',2026) where subject_id='fe130000-0000-4000-8000-000000000001'),
  1::bigint,
  'oversight consumes governed preparation-submission review state'
);

select is(
  (select reflected_lesson_count from public.resolve_hod_teaching_oversight('22222222-2222-4222-8222-222222222222',2026) where subject_id='fe130000-0000-4000-8000-000000000001'),
  1::bigint,
  'oversight consumes actual teaching reflection without rewriting plan state'
);

select ok(
  not app_private.can_access_teaching_plan('22222222-2222-4222-8222-222222222222','fe150000-0000-4000-8000-000000000002'),
  'HOD role alone does not grant read access to an unassigned subject allocation'
);

reset role;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
set local role authenticated;

select ok(
  app_private.can_access_teaching_plan('22222222-2222-4222-8222-222222222222','fe150000-0000-4000-8000-000000000001'),
  'teacher self-scope remains available for the teacher own current allocation'
);

select ok(
  not app_private.can_access_teaching_plan('22222222-2222-4222-8222-222222222222','fe150000-0000-4000-8000-000000000002'),
  'teacher self-scope does not widen to another teacher allocation'
);

reset role;
update public.subject_department_responsibilities
set effective_to=current_date-1
where subject_id='fe130000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.resolve_hod_teaching_oversight('22222222-2222-4222-8222-222222222222',2026)),
  0,
  'stale subject responsibility no longer exposes current operational oversight'
);

reset role;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000004',true);
set local role authenticated;

select throws_ok(
  $$select * from public.resolve_hod_teaching_oversight('22222222-2222-4222-8222-222222222222'::uuid,2026)$$,
  'Permission denied',
  'cross-school HOD cannot inspect another school oversight'
);

reset role;
select * from finish();
rollback;
