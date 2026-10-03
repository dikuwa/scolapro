begin;

select plan(26);

select has_table(
  'public','assessment_mark_entry_windows',
  'mark-entry window policy table exists'
);

select has_table(
  'public','assessment_mark_reopen_authorizations',
  'bounded correction authorization table exists'
);

select has_column(
  'public','assessment_instances','correction_pending',
  'assessment instance tracks pending correction re-verification'
);

select has_column(
  'public','learner_marks','correction_authorization_id',
  'append-only learner mark revisions retain correction authorization provenance'
);

select has_column(
  'public','official_results','supersedes_result_id',
  'official results can link immutable correction replacements'
);

select has_column(
  'public','official_results','superseded_at',
  'official results retain supersession time'
);

select has_column(
  'public','official_results','superseded_by_result_id',
  'official results retain superseding result identity'
);

select has_function(
  'public','resolve_assessment_mark_entry_window',
  array['uuid'],
  'effective mark-entry state resolver exists'
);

select has_function(
  'public','configure_assessment_mark_entry_window',
  array['uuid','timestamp with time zone','timestamp with time zone','integer','text'],
  'mark-entry timing policy configuration RPC exists'
);

select has_function(
  'public','lock_assessment_mark_entry',
  array['uuid','text'],
  'manual mark-entry lock RPC exists'
);

select has_function(
  'public','authorize_assessment_mark_correction',
  array['uuid','text','uuid','text','timestamp with time zone','timestamp with time zone','boolean'],
  'bounded correction authorization RPC exists'
);

select has_function(
  'public','revoke_assessment_mark_correction',
  array['uuid','text'],
  'correction authorization revocation RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated','public.resolve_assessment_mark_entry_window(uuid)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.resolve_assessment_mark_entry_window(uuid)','EXECUTE'
  ),
  'mark-entry state resolver is authenticated-only'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  'correction authorization mutation is authenticated-only'
);

select ok(
  pg_get_functiondef(
    'app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamp with time zone)'::regprocedure
  ) ilike '%closing_soon%'
  and pg_get_functiondef(
    'app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamp with time zone)'::regprocedure
  ) ilike '%locked_again%'
  and pg_get_functiondef(
    'app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamp with time zone)'::regprocedure
  ) ilike '%reopened%',
  'effective resolver models OPEN/CLOSING SOON/LOCKED/REOPENED/LOCKED AGAIN lifecycle'
);

select ok(
  pg_get_functiondef(
    'app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamp with time zone)'::regprocedure
  ) ilike '%deadline_and_verification%'
  and pg_get_functiondef(
    'app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamp with time zone)'::regprocedure
  ) ilike '%manual_locked_at%',
  'effective resolver supports deadline, verification, combined and manual locking'
);

select ok(
  pg_get_functiondef(
    'app_private.enforce_learner_mark_recorder_integrity()'::regprocedure
  ) ilike '%can_edit_assessment_mark%'
  and pg_get_functiondef(
    'public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure
  ) ilike '%resolve_assessment_mark_entry_window%',
  'online and offline mark writes use the same server-authoritative mark-entry boundary'
);

select ok(
  pg_get_functiondef(
    'app_private.enforce_learner_mark_recorder_integrity()'::regprocedure
  ) ilike '%correction_authorization_id%'
  and pg_get_functiondef(
    'app_private.audit_corrected_learner_mark()'::regprocedure
  ) ilike '%old_numeric_mark%'
  and pg_get_functiondef(
    'app_private.audit_corrected_learner_mark()'::regprocedure
  ) ilike '%new_numeric_mark%',
  'corrected mark revisions bind authorization and audit old/new values'
);

select ok(
  pg_get_functiondef(
    'public.review_mark_submission(uuid,text,text)'::regprocedure
  ) ilike '%correction_reverification%'
  and pg_get_functiondef(
    'public.review_mark_submission(uuid,text,text)'::regprocedure
  ) ilike '%correction_pending%',
  'review verification closes the correction re-verification cycle'
);

select ok(
  pg_get_functiondef(
    'public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure
  ) ilike '%subject_class%'
  and pg_get_functiondef(
    'public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure
  ) ilike '%school leadership authority%',
  'subject-class reopen scope is stronger than learner/component scope'
);

select ok(
  pg_get_functiondef(
    'public.reopen_assessment_for_correction(uuid,text)'::regprocedure
  ) ilike '%explicit scope, start, and expiry%',
  'legacy unbounded reopen path is disabled'
);

select ok(
  exists(
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='official_results'
      and indexname='official_results_current_subject_term_uidx'
      and indexdef ilike '%where (superseded_at is null)%'
  ),
  'only one current official result may exist for a learner subject term'
);

select ok(
  pg_get_functiondef(
    'public.approve_official_subject_result(uuid,uuid,smallint,uuid)'::regprocedure
  ) ilike '%correction_authorization_id%'
  and pg_get_functiondef(
    'public.approve_official_subject_result(uuid,uuid,smallint,uuid)'::regprocedure
  ) ilike '%superseded_by_result_id%'
  and pg_get_functiondef(
    'public.approve_official_subject_result(uuid,uuid,smallint,uuid)'::regprocedure
  ) ilike '%report_card.reissue_required%',
  'corrected official-result approval requires governed correction provenance and records report reissue need'
);

select ok(
  pg_get_functiondef(
    'app_private.enforce_official_result_integrity()'::regprocedure
  ) ilike '%calculation and approval provenance are immutable%'
  and pg_get_functiondef(
    'app_private.enforce_official_result_integrity()'::regprocedure
  ) ilike '%supersession time is immutable%',
  'historical official-result content and supersession provenance remain immutable'
);

select ok(
  pg_get_functiondef(
    'public.build_report_card_snapshot_management_internal(uuid,smallint,text)'::regprocedure
  ) ilike '%official_results_current%',
  'new report-card snapshots read only the non-superseded official result'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname='public'
      and tablename in (
        'assessment_mark_entry_windows',
        'assessment_mark_reopen_authorizations'
      )
      and cmd='SELECT'
  ),
  2,
  'new governance tables expose read-only RLS policies to authenticated assessment users'
);

select * from finish();
rollback;
