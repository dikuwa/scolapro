begin;

select plan(18);

select has_table(
  'public',
  'document_intake_adapter_rows',
  'shared document intake has operational adapter rows'
);

select has_function(
  'public','create_operational_intake_job',
  array['uuid','integer','text','text','text'],
  'operational intake job RPC exists'
);
select has_function(
  'public','stage_operational_intake_rows',
  array['uuid','jsonb'],
  'operational row staging RPC exists'
);
select has_function(
  'public','correct_operational_intake_row',
  array['uuid','jsonb'],
  'operational correction RPC exists'
);
select has_function(
  'public','review_operational_intake_row',
  array['uuid','text'],
  'operational human-review RPC exists'
);
select has_function(
  'public','commit_operational_intake_job',
  array['uuid'],
  'operational governed commit RPC exists'
);

select is(
  has_function_privilege('anon','public.create_operational_intake_job(uuid,integer,text,text,text)','EXECUTE'),
  false,
  'anon cannot create operational intake jobs'
);
select is(
  has_function_privilege('anon','public.stage_operational_intake_rows(uuid,jsonb)','EXECUTE'),
  false,
  'anon cannot stage operational rows'
);
select is(
  has_function_privilege('anon','public.correct_operational_intake_row(uuid,jsonb)','EXECUTE'),
  false,
  'anon cannot correct operational rows'
);
select is(
  has_function_privilege('anon','public.review_operational_intake_row(uuid,text)','EXECUTE'),
  false,
  'anon cannot review operational rows'
);
select is(
  has_function_privilege('anon','public.commit_operational_intake_job(uuid)','EXECUTE'),
  false,
  'anon cannot commit operational intake'
);

select ok(
  pg_get_functiondef(
    'public.commit_operational_intake_job(uuid)'::regprocedure
  ) like '%create_school_learner_calendar_event%',
  'calendar adapter commits through canonical calendar governance'
);

select ok(
  pg_get_functiondef(
    'public.commit_operational_intake_job(uuid)'::regprocedure
  ) like '%create_timetable_slot%',
  'timetable adapter commits through canonical timetable slot governance'
);

select ok(
  pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%e.starts_on=v_starts_on%'
  and pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%e.audience_scope=v_audience_scope%'
  and pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%audience_reference_id is not distinct from v_audience_reference_id%',
  'calendar update identity requires title/date/audience parity rather than title alone'
);

select ok(
  pg_get_functiondef(
    'app_private.can_manage_document_intake(uuid,text)'::regprocedure
  ) like '%p_intake_type=''calendar''%'
  and pg_get_functiondef(
    'app_private.can_manage_document_intake(uuid,text)'::regprocedure
  ) like '%p_intake_type=''timetable''%',
  'shared intake authorization explicitly covers calendar and timetable adapters'
);

select ok(
  pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%Teaching group code is unmatched.%'
  and pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%Teaching group code is ambiguous.%',
  'timetable intake fails closed on missing or ambiguous teaching-group codes'
);

select ok(
  pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%public.teaching_group_allocations%'
  and pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%tga.teacher_allocation_id=v_allocation_id%',
  'supplied teaching group must be linked to the resolved canonical teacher allocation'
);

select ok(
  pg_get_functiondef(
    'app_private.classify_operational_intake_payload(uuid,jsonb)'::regprocedure
  ) like '%'||quote_literal('teaching_group_id')||',v_group_id%',
  'resolved canonical teaching-group id is retained in normalized staged provenance'
);

select * from finish();
rollback;
