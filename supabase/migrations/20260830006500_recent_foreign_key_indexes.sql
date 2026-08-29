-- Recent governance migrations introduced additional foreign keys after the broad
-- FK-index sweep. Index them now so relationship joins and parent-row lifecycle checks
-- do not degrade into table scans as schools accumulate operational history.

create index if not exists admission_applications_learner_idx
  on public.admission_applications(learner_id)
  where learner_id is not null;

create index if not exists client_operation_receipts_tenant_idx
  on public.client_operation_receipts(tenant_id);

create index if not exists guardian_absence_attachments_school_idx
  on public.guardian_absence_notice_attachments(school_id);
create index if not exists guardian_absence_attachments_tenant_idx
  on public.guardian_absence_notice_attachments(tenant_id);
create index if not exists guardian_absence_attachments_uploader_idx
  on public.guardian_absence_notice_attachments(uploaded_by_user_id);

create index if not exists guardian_absence_notices_enrolment_idx
  on public.guardian_absence_notices(enrolment_id);
create index if not exists guardian_absence_notices_guardian_idx
  on public.guardian_absence_notices(guardian_id);
create index if not exists guardian_absence_notices_reviewer_idx
  on public.guardian_absence_notices(reviewed_by_user_id)
  where reviewed_by_user_id is not null;
create index if not exists guardian_absence_notices_submitter_idx
  on public.guardian_absence_notices(submitted_by_user_id);
create index if not exists guardian_absence_notices_tenant_idx
  on public.guardian_absence_notices(tenant_id);

create index if not exists import_batches_archived_by_idx
  on public.import_batches(archived_by_user_id)
  where archived_by_user_id is not null;

create index if not exists learner_contributions_received_staff_idx
  on public.learner_voluntary_contributions(received_by_staff_member_id)
  where received_by_staff_member_id is not null;
create index if not exists learner_contributions_enrolment_idx
  on public.learner_voluntary_contributions(enrolment_id);
create index if not exists learner_contributions_item_idx
  on public.learner_voluntary_contributions(item_id);
create index if not exists learner_contributions_recorder_idx
  on public.learner_voluntary_contributions(recorded_by_user_id);
create index if not exists learner_contributions_reversed_by_idx
  on public.learner_voluntary_contributions(reversed_by_user_id)
  where reversed_by_user_id is not null;
create index if not exists learner_contributions_school_idx
  on public.learner_voluntary_contributions(school_id);
create index if not exists learner_contributions_tenant_idx
  on public.learner_voluntary_contributions(tenant_id);
create index if not exists learner_contributions_verified_by_idx
  on public.learner_voluntary_contributions(verified_by_user_id)
  where verified_by_user_id is not null;

create index if not exists profile_change_requests_requester_idx
  on public.profile_change_requests(requested_by_user_id);
create index if not exists profile_change_requests_reviewer_idx
  on public.profile_change_requests(reviewed_by_user_id)
  where reviewed_by_user_id is not null;
create index if not exists profile_change_requests_tenant_idx
  on public.profile_change_requests(tenant_id);

create index if not exists progression_publications_destination_class_idx
  on public.year_end_progression_publications(destination_register_class_id)
  where destination_register_class_id is not null;
create index if not exists progression_publications_destination_enrolment_idx
  on public.year_end_progression_publications(destination_enrolment_id)
  where destination_enrolment_id is not null;
create index if not exists progression_publications_destination_grade_idx
  on public.year_end_progression_publications(destination_grade_id)
  where destination_grade_id is not null;
create index if not exists progression_publications_publisher_idx
  on public.year_end_progression_publications(published_by_user_id);
create index if not exists progression_publications_source_enrolment_idx
  on public.year_end_progression_publications(source_enrolment_id);
create index if not exists progression_publications_tenant_idx
  on public.year_end_progression_publications(tenant_id);
