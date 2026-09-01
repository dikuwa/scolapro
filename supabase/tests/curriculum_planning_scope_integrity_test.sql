begin;
select plan(12);

select has_function('app_private','enforce_school_curriculum_overlay_scope_integrity',array[]::text[],'overlay scope helper exists');
select has_function('app_private','enforce_pacing_plan_scope_integrity',array[]::text[],'pacing plan scope helper exists');
select has_function('app_private','enforce_pacing_plan_item_scope_integrity',array[]::text[],'pacing item scope helper exists');

select trigger_is('public','school_curriculum_overlays','school_curriculum_overlay_scope_integrity_trg','app_private','enforce_school_curriculum_overlay_scope_integrity','overlay integrity trigger installed');
select trigger_is('public','pacing_plans','pacing_plan_scope_integrity_trg','app_private','enforce_pacing_plan_scope_integrity','pacing plan integrity trigger installed');
select trigger_is('public','pacing_plan_items','pacing_plan_item_scope_integrity_trg','app_private','enforce_pacing_plan_item_scope_integrity','pacing item integrity trigger installed');

select is(has_function_privilege('anon','app_private.enforce_school_curriculum_overlay_scope_integrity()','EXECUTE'),false,'anon cannot execute overlay helper');
select is(has_function_privilege('authenticated','app_private.enforce_school_curriculum_overlay_scope_integrity()','EXECUTE'),false,'authenticated cannot execute overlay helper');
select is(has_function_privilege('anon','app_private.enforce_pacing_plan_scope_integrity()','EXECUTE'),false,'anon cannot execute pacing plan helper');
select is(has_function_privilege('authenticated','app_private.enforce_pacing_plan_scope_integrity()','EXECUTE'),false,'authenticated cannot execute pacing plan helper');
select is(has_function_privilege('anon','app_private.enforce_pacing_plan_item_scope_integrity()','EXECUTE'),false,'anon cannot execute pacing item helper');
select is(has_function_privilege('authenticated','app_private.enforce_pacing_plan_item_scope_integrity()','EXECUTE'),false,'authenticated cannot execute pacing item helper');

select * from finish();
rollback;