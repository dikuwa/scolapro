begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb000000-0000-4000-8000-000000000001','coverage-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000002','coverage-hod@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000003','coverage-platform@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Coverage Test School','COVERAGE-TEST','Erongo','Walvis Bay','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fb110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','COV-T','Coverage','Teacher','active'),
  ('fb110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000002','COV-H','Coverage','HOD','active'),
  ('fb110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000003','COV-P','Coverage','PlatformTeacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('fb120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','teacher',current_date-30),
  ('fb120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000002','fb110000-0000-4000-8000-000000000002','hod',current_date-30),
  ('fb120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000003','fb110000-0000-4000-8000-000000000003','teacher',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fb000000-0000-4000-8000-000000000003','platform_admin',current_date-30);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
  ('fb130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','teacher',current_date-30,'fb000000-0000-4000-8000-000000000001'),
  ('fb130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000002','teacher',current_date-30,'fb000000-0000-4000-8000-000000000002'),
  ('fb130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000003','teacher',current_date-30,'fb000000-0000-4000-8000-000000000003');

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values
  ('fb140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb141000-0000-4000-8000-000000000001','fb142000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001',current_date-30),
  ('fb140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb141000-0000-4000-8000-000000000001','fb142000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000002',current_date-30),
  ('fb140000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb141000-0000-4000-8000-000000000001','fb142000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000003',current_date-30);

insert into public.teaching_schedule_items(
  id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status
) values
  ('fb150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb151000-0000-4000-8000-000000000001','fb142000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-000000000001',current_date,1,'planned'),
  ('fb150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb151000-0000-4000-8000-000000000002','fb142000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-000000000002',current_date,1,'planned'),
  ('fb150000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',2026,'fb151000-0000-4000-8000-000000000003','fb142000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-000000000003',current_date,1,'planned');

set local session_replication_role = origin;

select ok(
  app_private.can_record_teaching_actual(
    'fb000000-0000-4000-8000-000000000001',
    'fb100000-0000-4000-8000-000000000001',
    'fb140000-0000-4000-8000-000000000001',
    current_date
  ),
  'current allocated teacher can record teaching actual'
);

select ok(
  not app_private.can_record_teaching_actual(
    'fb000000-0000-4000-8000-000000000002',
    'fb100000-0000-4000-8000-000000000001',
    'fb140000-0000-4000-8000-000000000002',
    current_date
  ),
  'HOD visibility does not imply teaching-actual mutation authority'
);

select ok(
  not app_private.can_record_teaching_actual(
    'fb000000-0000-4000-8000-000000000003',
    'fb100000-0000-4000-8000-000000000001',
    'fb140000-0000-4000-8000-000000000003',
    current_date
  ),
  'platform membership cannot record school-operational teaching actuals'
);

select lives_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('fb170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000001',current_date,'taught','fb000000-0000-4000-8000-000000000001')$$,
  'teacher-owned actual insert passes the integrity trigger'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('fb170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000002',current_date,'taught','fb000000-0000-4000-8000-000000000002')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'leadership-only recorder is rejected by the integrity trigger'
);

select throws_ok(
  $$insert into public.teaching_actuals(id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id)
    values('fb170000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000003',current_date,'taught','fb000000-0000-4000-8000-000000000003')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'platform recorder is rejected by the integrity trigger'
);

select ok(
  (
    select pg_get_expr(polwithcheck, polrelid)
    from pg_policy
    where polrelid = 'public.teaching_actuals'::regclass
      and polname = 'recording teacher can create teaching actuals'
  ) like '%can_record_teaching_actual%',
  'teaching_actual INSERT RLS consumes the narrow recorder predicate'
);

select * from finish();
rollback;
