-- Several authoritative/history tables are intentionally mutated only by governed
-- RPCs, triggers or background workflows. Their RLS currently exposes SELECT only,
-- yet inherited table grants still advertise client INSERT/UPDATE/DELETE capability.
-- Close that latent surface so future policy edits cannot accidentally open raw DML.

-- Academic calendar lifecycle is governed by academic-year/calendar functions.
revoke insert,update,delete on public.academic_years from authenticated;
revoke insert,update,delete on public.academic_terms from authenticated;

-- Attendance event/submission ledgers are produced by register submission RPCs.
revoke insert,update,delete on public.attendance_events from authenticated;
revoke insert,update,delete on public.attendance_register_submissions from authenticated;
revoke insert,update,delete on public.subject_attendance_submissions from authenticated;

-- Detention sessions/items are governed operational ledgers, not raw editable rows.
revoke insert,update,delete on public.detention_sessions from authenticated;
revoke insert,update,delete on public.detention_session_items from authenticated;

-- Report-card snapshots/documents are generated immutable publication artifacts.
revoke insert,update,delete on public.report_card_snapshots from authenticated;
revoke insert,update,delete on public.report_card_documents from authenticated;

-- Sequence/identifier/invitation tables are internal workflow state.
revoke insert,update,delete on public.school_admission_sequences from authenticated;
revoke insert,update,delete on public.school_learner_identifiers from authenticated;
revoke insert,update,delete on public.school_invitations from authenticated;

-- Platform/tenant identity and authorization roots are never direct client DML.
revoke insert,update,delete on public.platform_memberships from authenticated;
revoke insert,update,delete on public.tenants from authenticated;

-- Preserve intended read access where RLS permits it.
grant select on public.academic_years, public.academic_terms,
  public.attendance_events, public.attendance_register_submissions,
  public.subject_attendance_submissions, public.detention_sessions,
  public.detention_session_items, public.report_card_snapshots,
  public.report_card_documents, public.school_admission_sequences,
  public.school_learner_identifiers, public.school_invitations,
  public.platform_memberships, public.tenants to authenticated;

comment on table public.report_card_snapshots is
'Authoritative immutable report-card snapshot. Client table access is read-only; publication/generation workflows own mutation.';
comment on table public.attendance_register_submissions is
'Authoritative attendance submission ledger. Client table access is read-only; register submission RPCs own mutation.';
comment on table public.school_invitations is
'Invitation workflow state. Client table access is read-only; governed invitation functions own mutation.';
