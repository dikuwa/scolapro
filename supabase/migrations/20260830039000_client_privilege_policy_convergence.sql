-- Close stale client grants that have no corresponding RLS mutation policy today.
-- These verbs are already unusable through PostgREST because RLS has no matching
-- policy; removing the table/view privilege makes that boundary explicit and keeps a
-- future policy edit from silently activating a raw DML path.

-- Read-model/current-state views are query surfaces only.
revoke insert,update,delete on public.attendance_current from authenticated;
revoke insert,update,delete on public.daily_register_current from authenticated;
revoke insert,update,delete on public.late_arrival_weekly_readiness from authenticated;
revoke insert,update,delete on public.late_detention_history from authenticated;
revoke insert,update,delete on public.late_detention_open_queue from authenticated;
revoke insert,update,delete on public.learner_marks_current from authenticated;
revoke insert,update,delete on public.subject_attendance_current from authenticated;

-- Reference/derived operational state with SELECT-only RLS.
revoke insert,update,delete on public.attendance_reasons from authenticated;
revoke insert,update,delete on public.late_detention_obligations from authenticated;
revoke insert,update,delete on public.school_late_arrival_events from authenticated;

-- Append/update ledgers: preserve only verbs for which an RLS policy exists.
revoke delete on public.achievement_events from authenticated;
revoke delete on public.audit_events from authenticated;
revoke delete on public.communication_messages from authenticated;
revoke delete on public.conduct_events from authenticated;
revoke update,delete on public.learner_marks from authenticated;
revoke delete on public.mark_submissions from authenticated;
revoke update,delete on public.official_results from authenticated;
revoke update,delete on public.statutory_certifications from authenticated;
revoke update,delete on public.teaching_actuals from authenticated;
revoke update,delete on public.tenant_lifecycle_events from authenticated;
revoke delete on public.guardian_addresses from authenticated;
revoke delete on public.grading_scales from authenticated;
revoke delete on public.user_profiles from authenticated;
revoke delete on public.year_end_progressions from authenticated;

-- Evidence rows can be inserted/read/deleted by existing policies, but no client
-- UPDATE policy exists. Replacing evidence should be delete + governed re-upload.
revoke update on public.attendance_evidence from authenticated;

-- Notifications are produced by server workflows; authenticated users may read,
-- update their own state and delete where RLS permits, but cannot forge new rows.
revoke insert on public.notifications from authenticated;

-- Preserve the query grants for read models explicitly.
grant select on public.attendance_current, public.daily_register_current,
  public.late_arrival_weekly_readiness, public.late_detention_history,
  public.late_detention_open_queue, public.learner_marks_current,
  public.subject_attendance_current, public.attendance_reasons,
  public.late_detention_obligations, public.school_late_arrival_events to authenticated;

comment on view public.attendance_current is
'Current attendance read model. Authenticated client access is SELECT-only; submission workflows own mutation.';
comment on view public.learner_marks_current is
'Current marks read model. Authenticated client access is SELECT-only; mark submission workflows own mutation.';
comment on table public.audit_events is
'Append-only audit ledger for authenticated clients. Existing RLS may permit governed inserts; update/delete are not client capabilities.';
