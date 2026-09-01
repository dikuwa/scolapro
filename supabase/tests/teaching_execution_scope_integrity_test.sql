begin;

select plan(15);

select has_function('app_private','enforce_teaching_schedule_item_scope_integrity',array[]::text[],'teaching schedule scope helper exists');
select has_function('app_private','enforce_lesson_preparation_scope_integrity',array[]::text[],'lesson preparation scope helper exists');
select has_function('app_private','enforce_teaching_actual_scope_integrity',array[]::text[],'teaching actual scope helper exists');

select trigger_is('public','teaching_schedule_items','teaching_schedule_item_scope_integrity_trg','app_private','enforce_teaching_schedule_item_scope_integrity','teaching schedule integrity trigger installed');
select trigger_is('public','lesson_preparations','lesson_preparation_scope_integrity_trg','app_private','enforce_lesson_preparation_scope_integrity','lesson preparation integrity trigger installed');
select trigger_is('public','teaching_actuals','teaching_actual_scope_integrity_trg','app_private','enforce_teaching_actual_scope_integrity','teaching actual integrity trigger installed');

select is(has_function_privilege('anon','app_private.enforce_teaching_schedule_item_scope_integrity()','EXECUTE'),false,'anon cannot execute teaching schedule helper');
select is(has_function_privilege('authenticated','app_private.enforce_teaching_schedule_item_scope_integrity()','EXECUTE'),false,'authenticated cannot execute teaching schedule helper');
select is(has_function_privilege('anon','app_private.enforce_lesson_preparation_scope_integrity()','EXECUTE'),false,'anon cannot execute lesson preparation helper');
select is(has_function_privilege('authenticated','app_private.enforce_lesson_preparation_scope_integrity()','EXECUTE'),false,'authenticated cannot execute lesson preparation helper');
select is(has_function_privilege('anon','app_private.enforce_teaching_actual_scope_integrity()','EXECUTE'),false,'anon cannot execute teaching actual helper');
select is(has_function_privilege('authenticated','app_private.enforce_teaching_actual_scope_integrity()','EXECUTE'),false,'authenticated cannot execute teaching actual helper');

select throws_ok(
  $$insert into public.teaching_schedule_items(
      tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fd100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fd110000-0000-4000-8000-000000000001','2026-09-01'
    )$$,
  'Teaching schedule scope mismatch: pacing plan item does not exist',
  'teaching schedule rejects a missing authoritative pacing parent before FK-only handling'
);

select throws_ok(
  $$insert into public.lesson_preparations(
      tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd120000-0000-4000-8000-000000000001','2026-09-01','fd130000-0000-4000-8000-000000000001'
    )$$,
  'Lesson preparation scope mismatch: teaching schedule item does not exist',
  'lesson preparation rejects a missing authoritative schedule parent'
);

select throws_ok(
  $$insert into public.teaching_actuals(
      tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd120000-0000-4000-8000-000000000001','2026-09-01','taught','fd130000-0000-4000-8000-000000000001'
    )$$,
  'Teaching actual scope mismatch: teaching schedule item does not exist',
  'teaching actual rejects a missing authoritative schedule parent'
);

select * from finish();
rollback;
