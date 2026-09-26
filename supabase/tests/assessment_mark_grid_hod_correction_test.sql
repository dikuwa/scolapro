begin;

select plan(9);

select has_table('public','assessment_correction_requests','governed assessment correction request ledger exists');

select ok(
  pg_get_functiondef('app_private.can_review_assessment_subject(uuid,uuid)'::regprocedure)
    ilike '%hod_responsible_for_subject%',
  'HOD assessment review authority derives from effective subject responsibility'
);

select ok(
  pg_get_functiondef('public.review_mark_submission(uuid,text,text)'::regprocedure)
    ilike '%can_review_assessment_subject%',
  'HOD verification/return uses subject portfolio authority'
);

select ok(
  pg_get_functiondef('app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)'::regprocedure)
    ilike '%can_review_assessment_subject%',
  'assessment instance authority uses portfolio-scoped leadership branch'
);

select ok(
  pg_get_functiondef('public.request_assessment_correction(uuid,text)'::regprocedure)
    ilike '%A correction reason is required%'
  and pg_get_functiondef('public.request_assessment_correction(uuid,text)'::regprocedure)
    ilike '%assessment.correction_requested%',
  'correction request requires reason and writes audit provenance'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid)'::regprocedure)
    ilike '%Locked assessment requires the governed official-result correction workflow%',
  'locked assessments cannot be silently reopened'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid)'::regprocedure)
    ilike '%status=''returned''%'
  and pg_get_functiondef('public.reopen_assessment_for_correction(uuid)'::regprocedure)
    ilike '%assessment.reopened_for_correction%',
  'eligible reopen returns workflow to correction state and audits the transition'
);

select ok(
  has_function_privilege('authenticated','public.request_assessment_correction(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.request_assessment_correction(uuid,text)','EXECUTE'),
  'correction request RPC is authenticated-only'
);

select ok(
  has_function_privilege('authenticated','public.reopen_assessment_for_correction(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.reopen_assessment_for_correction(uuid)','EXECUTE'),
  'reopen RPC is authenticated-only'
);

select * from finish();
rollback;
