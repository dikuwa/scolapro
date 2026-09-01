-- Close the remaining foreign-key index findings exposed after staging migration parity.
-- These indexes are intentionally narrow: each begins with the referencing FK column so
-- parent-row updates/deletes and FK joins do not require full-table scans.

-- Communication delivery/template governance.
create index if not exists communication_delivery_receipts_recipient_idx
  on public.communication_delivery_receipts (recipient_id);
create index if not exists communication_delivery_receipts_school_idx
  on public.communication_delivery_receipts (school_id);
create index if not exists communication_delivery_receipts_tenant_idx
  on public.communication_delivery_receipts (tenant_id);
create index if not exists communication_messages_template_version_idx
  on public.communication_messages (template_version_id);
create index if not exists comm_provider_template_bindings_updated_by_idx
  on public.communication_provider_template_bindings (updated_by_user_id);
create index if not exists communication_template_versions_approved_by_idx
  on public.communication_template_versions (approved_by_user_id);
create index if not exists communication_template_versions_created_by_idx
  on public.communication_template_versions (created_by_user_id);
create index if not exists communication_templates_created_by_idx
  on public.communication_templates (created_by_user_id);
create index if not exists communication_templates_tenant_idx
  on public.communication_templates (tenant_id);

-- Detention supervision preferences.
create index if not exists detention_supervision_preferences_staff_idx
  on public.detention_supervision_preferences (staff_member_id);
create index if not exists detention_supervision_preferences_tenant_idx
  on public.detention_supervision_preferences (tenant_id);
create index if not exists detention_supervision_preferences_updated_by_idx
  on public.detention_supervision_preferences (updated_by_user_id);

-- Cumulative learner record tables. Existing school/learner timeline indexes are useful
-- for application reads but do not cover FK maintenance where learner_id is not leading.
create index if not exists learner_cumulative_notes_enrolment_idx
  on public.learner_cumulative_notes (enrolment_id);
create index if not exists learner_cumulative_notes_learner_fk_idx
  on public.learner_cumulative_notes (learner_id);
create index if not exists learner_cumulative_notes_recorded_by_idx
  on public.learner_cumulative_notes (recorded_by_user_id);
create index if not exists learner_cumulative_notes_tenant_idx
  on public.learner_cumulative_notes (tenant_id);

create index if not exists learner_development_observations_enrolment_idx
  on public.learner_development_observations (enrolment_id);
create index if not exists learner_development_observations_learner_fk_idx
  on public.learner_development_observations (learner_id);
create index if not exists learner_development_observations_recorded_by_idx
  on public.learner_development_observations (recorded_by_user_id);
create index if not exists learner_development_observations_tenant_idx
  on public.learner_development_observations (tenant_id);

create index if not exists learner_health_history_enrolment_idx
  on public.learner_health_history (enrolment_id);
create index if not exists learner_health_history_learner_fk_idx
  on public.learner_health_history (learner_id);
create index if not exists learner_health_history_recorded_by_idx
  on public.learner_health_history (recorded_by_user_id);
create index if not exists learner_health_history_tenant_idx
  on public.learner_health_history (tenant_id);

create index if not exists learner_prior_school_history_enrolment_idx
  on public.learner_prior_school_history (enrolment_id);
create index if not exists learner_prior_school_history_learner_fk_idx
  on public.learner_prior_school_history (learner_id);
create index if not exists learner_prior_school_history_recorded_by_idx
  on public.learner_prior_school_history (recorded_by_user_id);
create index if not exists learner_prior_school_history_tenant_idx
  on public.learner_prior_school_history (tenant_id);

create index if not exists learner_psychometric_records_enrolment_idx
  on public.learner_psychometric_records (enrolment_id);
create index if not exists learner_psychometric_records_learner_fk_idx
  on public.learner_psychometric_records (learner_id);
create index if not exists learner_psychometric_records_recorded_by_idx
  on public.learner_psychometric_records (recorded_by_user_id);
create index if not exists learner_psychometric_records_tenant_idx
  on public.learner_psychometric_records (tenant_id);
create index if not exists learner_psychometric_records_tester_staff_idx
  on public.learner_psychometric_records (tester_staff_member_id);
