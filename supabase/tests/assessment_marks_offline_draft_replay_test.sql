begin;

select plan(11);

select has_function(
  'public',
  'submit_offline_assessment_mark',
  array['uuid','uuid','uuid','numeric','text','text','uuid','uuid'],
  'offline marks draft replay RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)',
    'EXECUTE'
  ),
  'offline marks replay is authenticated-only'
);

select ok(
  position('for update' in pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'))) > 0,
  'replay locks the assessment instance and current mark'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%client_mutation_id%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%idempotency_payload_mismatch%',
  'replay uses a stable client mutation id and rejects payload reuse'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%stale_version%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%current_version%',
  'stale base versions have an explicit conflict outcome'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%v_instance.status <> ''open''%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%assessment_not_editable%',
  'closed assessment windows are explicitly rejected'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%can_access_assessment_instance%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%auth.uid()%',
  'current actor and assessment allocation scope are revalidated'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%replaces_mark_id%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%learner_marks%',
  'working marks remain append-only revisions'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) not ilike '%official_results%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) not ilike '%mark_submissions%',
  'replay cannot approve, moderate, or publish results'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%outcome'',''success%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%outcome'',''conflicted%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%outcome'',''rejected%',
  'replay exposes success, conflict, and rejection outcomes'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%status <> ''open''%'
  and pg_get_functiondef(to_regprocedure('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)')) ilike '%p_expected_version%',
  'replay requires both an editable window and an expected version'
);

select * from finish();
rollback;