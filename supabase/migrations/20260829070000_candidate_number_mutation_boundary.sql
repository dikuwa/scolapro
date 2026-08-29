-- Candidate numbers are authority-issued identifiers with append-oriented assignment
-- history. Exam staff may create candidates and maintain registration/readiness fields,
-- but candidate/centre-number changes must pass through the governed assignment RPC so
-- provenance cannot be bypassed by ordinary table inserts or updates.

revoke insert, update on table public.examination_candidates from authenticated;

grant insert (
  tenant_id,
  school_id,
  examination_cycle_id,
  learner_id,
  enrolment_id,
  registration_status,
  identity_verified,
  identity_issue,
  created_by_user_id,
  submitted_at
) on table public.examination_candidates to authenticated;

grant update (
  registration_status,
  identity_verified,
  identity_issue,
  submitted_at,
  updated_at
) on table public.examination_candidates to authenticated;

comment on column public.examination_candidates.candidate_number is
'Official authority-issued Candidate Number. Authenticated clients cannot insert or update this column directly; use assign_examination_candidate_number so history and audit provenance are preserved.';

comment on column public.examination_candidates.centre_number is
'Official examination Centre Number associated with candidate-number assignment. Authenticated clients cannot insert or update this column directly; use assign_examination_candidate_number.';
