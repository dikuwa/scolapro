begin;

select plan(6);

select has_function(
  'public',
  'save_lesson_preparation_offline_draft',
  array['uuid','jsonb','jsonb','uuid','timestamptz'],
  'offline lesson preparation draft RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)',
    'EXECUTE'
  ),
  'offline lesson preparation replay is authenticated-only'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%user_current_school_matches%'
  and pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%teacher_allocations%',
  'current school and teacher allocation authority are revalidated'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%status <> ''draft''%'
  and pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%no longer an editable draft%',
  'non-draft preparation state is rejected'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%p_expected_updated_at%'
  and pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%changed while this device was offline%',
  'stale draft versions are rejected'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%different lesson preparation data%'
  and pg_get_functiondef(to_regprocedure('public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)')) ilike '%offline_client_mutation_id%',
  'client mutation replay rejects payload mismatch'
);

select * from finish();
rollback;
