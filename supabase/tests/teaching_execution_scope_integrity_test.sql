begin;

select plan(12);

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

-- Existing generic parent-scope guards already reject missing or cross-school parents.
-- This suite therefore verifies installation and privilege closure for the stricter
-- execution guards, while the migration adds year/class/allocation consistency and
-- immutable root provenance without changing the established generic error contract.

select * from finish();
rollback;
