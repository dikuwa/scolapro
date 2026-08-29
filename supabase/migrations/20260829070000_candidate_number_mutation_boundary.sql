-- Candidate numbers are authority-issued identifiers with append-oriented assignment
-- history. Exam staff may continue to maintain registration/readiness fields directly,
-- but candidate/centre-number changes must pass through the governed assignment RPC so
-- provenance cannot be bypassed by an ordinary table update.

revoke update on table public.examination_candidates from authenticated;

grant update (
  registration_status,
  identity_verified,
  identity_issue,
  submitted_at,
  updated_at
) on table public.examination_candidates to authenticated;

comment on column public.examination_candidates.candidate_number is
'Official authority-issued Candidate Number. Authenticated clients cannot update this column directly; use assign_examination_candidate_number so history and audit provenance are preserved.';

comment on column public.examination_candidates.centre_number is
'Official examination Centre Number associated with candidate-number assignment. Authenticated clients cannot update this column directly; use assign_examination_candidate_number.';
