-- Complete high-value foreign-key indexes introduced by recent bulk domain work.
-- These are intentionally narrow indexes for relationship traversal and FK maintenance.

create index if not exists detention_sessions_tenant_idx on public.detention_sessions(tenant_id);
create index if not exists detention_sessions_created_by_idx on public.detention_sessions(created_by_user_id);
create index if not exists detention_sessions_completed_by_idx on public.detention_sessions(completed_by_user_id) where completed_by_user_id is not null;
create index if not exists detention_session_items_tenant_idx on public.detention_session_items(tenant_id);
create index if not exists detention_session_items_school_idx on public.detention_session_items(school_id);
create index if not exists detention_session_items_learner_idx on public.detention_session_items(learner_id);
create index if not exists detention_session_items_recorded_by_idx on public.detention_session_items(recorded_by_user_id) where recorded_by_user_id is not null;

create index if not exists report_card_documents_tenant_idx on public.report_card_documents(tenant_id);
create index if not exists report_card_documents_generated_by_idx on public.report_card_documents(generated_by_user_id) where generated_by_user_id is not null;
create index if not exists report_card_snapshots_tenant_idx on public.report_card_snapshots(tenant_id);
create index if not exists report_card_snapshots_generated_by_idx on public.report_card_snapshots(generated_by_user_id);
create index if not exists report_card_snapshots_certified_by_idx on public.report_card_snapshots(certified_by_user_id) where certified_by_user_id is not null;
create index if not exists report_card_snapshots_supersedes_idx on public.report_card_snapshots(supersedes_snapshot_id) where supersedes_snapshot_id is not null;

create index if not exists guardian_contacts_tenant_idx on public.guardian_contacts(tenant_id);
create index if not exists guardian_contacts_created_by_idx on public.guardian_contacts(created_by_user_id) where created_by_user_id is not null;
create index if not exists guardian_addresses_tenant_idx on public.guardian_addresses(tenant_id);
create index if not exists guardian_addresses_created_by_idx on public.guardian_addresses(created_by_user_id) where created_by_user_id is not null;
create index if not exists guardian_user_links_linked_by_idx on public.guardian_user_links(linked_by_user_id) where linked_by_user_id is not null;
create index if not exists learner_guardians_tenant_idx on public.learner_guardians(tenant_id);

create index if not exists communication_delivery_jobs_tenant_idx on public.communication_delivery_jobs(tenant_id);
create index if not exists communication_delivery_jobs_school_idx on public.communication_delivery_jobs(school_id);
create index if not exists communication_messages_tenant_idx on public.communication_messages(tenant_id);
create index if not exists communication_recipients_tenant_idx on public.communication_recipients(tenant_id);
create index if not exists communication_recipients_school_idx on public.communication_recipients(school_id);

create index if not exists import_batches_tenant_idx on public.import_batches(tenant_id);
create index if not exists import_batches_created_by_idx on public.import_batches(created_by_user_id);
create index if not exists import_rows_tenant_idx on public.import_rows(tenant_id);
create index if not exists import_rows_school_idx on public.import_rows(school_id);
create index if not exists import_commit_results_batch_idx on public.import_commit_results(batch_id);

create index if not exists school_duty_assignments_tenant_idx on public.school_duty_assignments(tenant_id);
create index if not exists school_duty_assignments_staff_idx on public.school_duty_assignments(staff_member_id);
create index if not exists school_duty_assignments_assigned_by_idx on public.school_duty_assignments(assigned_by_user_id);
create index if not exists school_late_arrival_policies_tenant_idx on public.school_late_arrival_policies(tenant_id);
create index if not exists school_late_arrival_policies_updated_by_idx on public.school_late_arrival_policies(updated_by_user_id) where updated_by_user_id is not null;
create index if not exists school_late_arrival_events_tenant_idx on public.school_late_arrival_events(tenant_id);
create index if not exists school_late_arrival_events_enrolment_idx on public.school_late_arrival_events(enrolment_id);
create index if not exists school_late_arrival_events_recorded_by_idx on public.school_late_arrival_events(recorded_by_user_id);
create index if not exists late_detention_obligations_tenant_idx on public.late_detention_obligations(tenant_id);
create index if not exists late_detention_obligations_learner_idx on public.late_detention_obligations(learner_id);
create index if not exists late_detention_obligations_completed_by_idx on public.late_detention_obligations(completed_by_user_id) where completed_by_user_id is not null;
