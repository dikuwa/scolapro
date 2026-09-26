begin;

select plan(11);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%v_instance.status not in (''open'',''returned'')%',
  'offline replay permits only editable open/returned assessment states'
);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%learner_not_eligible%',
  'offline replay rejects enrolment/class/year/learner identity mismatch'
);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%learner_not_registered_for_subject%',
  'offline replay respects populated learner subject registration'
);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%mark_exceeds_maximum%',
  'offline replay validates configured maximum marks'
);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%stale_version%',
  'offline replay preserves optimistic version conflict detection'
);

select ok(
  pg_get_functiondef('app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)'::regprocedure)
    ilike '%teacher_allocations%',
  'canonical assessment instance authority remains allocation-aware'
);

select ok(
  pg_get_functiondef('public.review_mark_submission(uuid,text,text)'::regprocedure)
    ilike '%hod_responsible_for_subject%',
  'HOD review is subject-portfolio scoped'
);

select ok(
  pg_get_functiondef('public.submit_assessment_for_review(uuid,text)'::regprocedure)
    ilike '%subject-registration-aware%',
  'submission completeness counts subject-eligible learners'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid,text)'::regprocedure)
    ilike '%A correction reason is required%',
  'governed correction requires an explicit reason'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid,text)'::regprocedure)
    ilike '%Official results already exist%',
  'correction cannot rewrite assessment evidence after official result finality'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid,text)'::regprocedure)
    ilike '%assessment.reopened_for_correction%',
  'correction reopen records an audit event'
);

select * from finish();
rollback;
