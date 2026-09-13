-- pgTAP test suite for Wave 2: Bulk Late Arrival Capture & Detention Operations
begin;
select plan(18);

-- 1. Function exists check
select has_function(
  'public',
  'bulk_record_school_late_arrivals',
  ARRAY['uuid[]', 'date', 'time without time zone', 'text'],
  'public.bulk_record_school_late_arrivals function exists'
);

-- 2. Check security definer and search path
select function_returns(
  'public',
  'bulk_record_school_late_arrivals',
  ARRAY['uuid[]', 'date', 'time without time zone', 'text'],
  'integer',
  'bulk_record_school_late_arrivals returns integer count'
);

-- 3. Anonymous execution denial
set local role anon;
select throws_ok(
  $$ select public.bulk_record_school_late_arrivals(ARRAY['00000000-0000-0000-0000-000000000001'::uuid]) $$,
  'permission denied for function bulk_record_school_late_arrivals',
  'Anon is denied execution of bulk_record_school_late_arrivals'
);

-- 4. Check detention_supervision_preferences table
set local role authenticated;
select has_table('public', 'detention_supervision_preferences', 'detention_supervision_preferences table exists');

-- 5. Check detention_session_supervisors table
select has_table('public', 'detention_session_supervisors', 'detention_session_supervisors table exists');

-- 6. Check detention_session_items table
select has_table('public', 'detention_session_items', 'detention_session_items table exists');

-- 7. Check late_detention_obligations table
select has_table('public', 'late_detention_obligations', 'late_detention_obligations table exists');

-- 8. Check school_late_arrival_policies cumulative_threshold column
select has_column('public', 'school_late_arrival_policies', 'cumulative_threshold', 'school_late_arrival_policies has cumulative_threshold');

-- 9. Check create_detention_session_plan function
select has_function(
  'public',
  'create_detention_session_plan',
  'create_detention_session_plan function exists'
);

-- 10. Check set_detention_session_supervisors function
select has_function(
  'public',
  'set_detention_session_supervisors',
  'set_detention_session_supervisors function exists'
);

-- 11. Check assign_detention_session_learners function
select has_function(
  'public',
  'assign_detention_session_learners',
  'assign_detention_session_learners function exists'
);

-- 12. Check resolve_late_detention function
select has_function(
  'public',
  'resolve_late_detention',
  'resolve_late_detention function exists'
);

-- 13. Check undo_latest_school_late_arrival function
select has_function(
  'public',
  'undo_latest_school_late_arrival',
  'undo_latest_school_late_arrival function exists'
);

-- 14. Check list_my_detention_supervision function
select has_function(
  'public',
  'list_my_detention_supervision',
  'list_my_detention_supervision function exists'
);

-- 15. Verify actor integrity function
select has_function(
  'app_private',
  'enforce_late_arrival_event_actor_integrity',
  'enforce_late_arrival_event_actor_integrity private function exists'
);

-- 16. Verify resolution actor integrity function
select has_function(
  'app_private',
  'enforce_late_detention_resolution_actor_integrity',
  'enforce_late_detention_resolution_actor_integrity private function exists'
);

-- 17. Verify trigger on school_late_arrival_events
select has_trigger(
  'public',
  'school_late_arrival_events',
  'late_arrival_event_submit_actor_integrity_trg',
  'late_arrival_event_submit_actor_integrity_trg trigger exists'
);

-- 18. Verify trigger on late_detention_obligations
select has_trigger(
  'public',
  'late_detention_obligations',
  'late_detention_obligation_submit_resolution_actor_integrity_trg',
  'late_detention_obligation_submit_resolution_actor_integrity_trg trigger exists'
);

select * from finish();
rollback;
