-- Complete the recent foreign-key index sweep after DNEA candidate-number and
-- voluntary-contribution governance introduced additional reference columns.

create index if not exists examination_candidate_number_history_assigned_by_idx
  on public.examination_candidate_number_history(assigned_by_user_id);

create index if not exists examination_candidate_number_history_school_idx
  on public.examination_candidate_number_history(school_id);

create index if not exists examination_candidate_number_history_tenant_idx
  on public.examination_candidate_number_history(tenant_id);

create index if not exists examination_candidates_number_assigned_by_idx
  on public.examination_candidates(candidate_number_assigned_by_user_id)
  where candidate_number_assigned_by_user_id is not null;

create index if not exists voluntary_contribution_campaigns_created_by_idx
  on public.voluntary_contribution_campaigns(created_by_user_id);

create index if not exists voluntary_contribution_campaigns_tenant_idx
  on public.voluntary_contribution_campaigns(tenant_id);

create index if not exists voluntary_contribution_items_school_idx
  on public.voluntary_contribution_items(school_id);

create index if not exists voluntary_contribution_items_tenant_idx
  on public.voluntary_contribution_items(tenant_id);
