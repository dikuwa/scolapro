begin;

select plan(11);

select ok(
  pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%resolve_assessment_mark_entry_window%'
  and pg_get_functiondef('public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure)
    ilike '%assessment_not_editable%',
  'offline replay uses the canonical mark-entry window decision instead of a parallel status check'
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
    ilike '%dated-enrolment-and-subject-registration%'
  and pg_get_functiondef('public.submit_assessment_for_review(uuid,text)'::regprocedure)
    ilike '%lm.numeric_mark is not null or lm.mark_status is not null%',
  'submission completeness counts dated subject-eligible learners with non-blank current marks'
);

select ok(
  pg_get_functiondef('public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean)'::regprocedure)
    ilike '%A correction reason is required%'
  and pg_get_functiondef('public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean)'::regprocedure)
    ilike '%expires_at%',
  'governed correction requires explicit reason and bounded expiry'
);

select ok(
  pg_get_functiondef('public.reopen_assessment_for_correction(uuid,text)'::regprocedure)
    ilike '%Use authorize_assessment_mark_correction with explicit scope, start, and expiry%'
  and pg_get_functiondef('app_private.enforce_official_result_integrity()'::regprocedure)
    ilike '%Official result cannot be deleted; use governed correction workflow%',
  'legacy reopen cannot bypass immutable official-result correction finality'
);

select ok(
  pg_get_functiondef('public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean)'::regprocedure)
    ilike '%assessment.mark_correction.authorized%'
  and pg_get_functiondef('app_private.audit_corrected_learner_mark()'::regprocedure)
    ilike '%assessment.mark_corrected%',
  'bounded correction authorization and corrected values are audited'
);

select * from finish();
rollback;
