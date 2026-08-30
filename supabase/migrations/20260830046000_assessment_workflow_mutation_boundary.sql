-- Submission moderation and official-result approval are governed state transitions.
-- Raw authenticated DML can bypass completeness checks, review provenance, calculated
-- grading, source locking and audit semantics. Keep these writes RPC-only.

-- Teachers submit through submit_assessment_for_review(), which verifies every current
-- learner has a mark and captures completeness/calculation provenance.
drop policy if exists "scoped academic staff can create mark submissions" on public.mark_submissions;
revoke insert on public.mark_submissions from authenticated;

-- Academic leaders review through review_mark_submission(), which constrains the
-- transition to return/verify, requires a return reason and synchronizes instance state.
drop policy if exists "academic leaders can update mark submissions" on public.mark_submissions;
revoke update on public.mark_submissions from authenticated;

-- Official outcomes are created only through approve_official_subject_result(), which
-- verifies required contributing assessments, calculates from current immutable mark
-- inputs, applies the configured grading scale and locks the source workflow.
drop policy if exists "academic leaders can create official results" on public.official_results;
revoke insert on public.official_results from authenticated;

comment on table public.mark_submissions is
'Assessment submission/moderation ledger. Authenticated clients may read within RLS scope, but creation and review state changes are RPC-only through submit_assessment_for_review and review_mark_submission.';
comment on table public.official_results is
'Authoritative locked subject-result ledger. Authenticated clients may read within relationship-aware RLS scope; creation is RPC-only through approve_official_subject_result.';
