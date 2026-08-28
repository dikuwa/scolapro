-- High-value foreign-key/query indexes across the operational domain model.
-- These are intentionally retained even when demo data has not exercised them yet.

-- Core academic structure.
create index if not exists grades_school_idx on public.grades(school_id);
create index if not exists register_classes_school_idx on public.register_classes(school_id);
create index if not exists register_classes_grade_idx on public.register_classes(grade_id);
create index if not exists enrolments_tenant_idx on public.enrolments(tenant_id);
create index if not exists enrolments_grade_idx on public.enrolments(grade_id);
create index if not exists enrolments_register_class_idx on public.enrolments(register_class_id);
create index if not exists enrolments_learner_idx on public.enrolments(learner_id);
create index if not exists subject_offerings_subject_idx on public.subject_offerings(subject_id);
create index if not exists subject_offerings_grade_idx on public.subject_offerings(grade_id);
create index if not exists teacher_allocations_offering_idx on public.teacher_allocations(subject_offering_id);
create index if not exists teacher_allocations_class_idx on public.teacher_allocations(register_class_id);
create index if not exists timetable_slots_period_idx on public.timetable_slots(period_id);
create index if not exists timetable_slots_class_idx on public.timetable_slots(register_class_id);
create index if not exists timetable_slots_allocation_idx on public.timetable_slots(teacher_allocation_id);

-- Attendance.
create index if not exists attendance_events_learner_idx on public.attendance_events(learner_id, attendance_date desc);
create index if not exists attendance_events_enrolment_idx on public.attendance_events(enrolment_id, attendance_date desc);
create index if not exists attendance_events_class_idx on public.attendance_events(register_class_id, attendance_date desc);
create index if not exists attendance_events_reason_idx on public.attendance_events(reason_id) where reason_id is not null;
create index if not exists attendance_events_submission_idx on public.attendance_events(register_submission_id) where register_submission_id is not null;
create index if not exists attendance_register_submissions_class_idx on public.attendance_register_submissions(register_class_id, attendance_date desc);
create index if not exists attendance_evidence_event_idx on public.attendance_evidence(attendance_event_id) where attendance_event_id is not null;

-- Conduct / achievement / support.
create index if not exists conduct_events_enrolment_idx on public.conduct_events(enrolment_id) where enrolment_id is not null;
create index if not exists achievement_events_enrolment_idx on public.achievement_events(enrolment_id) where enrolment_id is not null;
create index if not exists learner_support_cases_learner_idx on public.learner_support_cases(learner_id, opened_on desc);
create index if not exists learner_support_cases_enrolment_idx on public.learner_support_cases(enrolment_id) where enrolment_id is not null;
create index if not exists learner_support_cases_owner_idx on public.learner_support_cases(owner_staff_member_id) where owner_staff_member_id is not null;

-- LTSM / library.
create index if not exists learning_resource_copies_school_idx on public.learning_resource_copies(school_id);
create index if not exists learning_resource_loans_copy_idx on public.learning_resource_loans(copy_id);
create index if not exists learning_resource_loans_due_idx on public.learning_resource_loans(school_id, due_on) where status in ('open','overdue');

-- Communications.
create index if not exists communication_recipients_learner_idx on public.communication_recipients(learner_id) where learner_id is not null;
create index if not exists communication_recipients_staff_idx on public.communication_recipients(staff_member_id) where staff_member_id is not null;
create index if not exists communication_messages_creator_idx on public.communication_messages(created_by_user_id, created_at desc);

-- Admissions / transfers / progression.
create index if not exists admission_applications_grade_idx on public.admission_applications(requested_grade_id) where requested_grade_id is not null;
create index if not exists transfer_events_source_enrolment_idx on public.transfer_events(source_enrolment_id);
create index if not exists transfer_events_destination_school_idx on public.transfer_events(destination_school_id) where destination_school_id is not null;
create index if not exists year_end_progressions_enrolment_idx on public.year_end_progressions(enrolment_id);
create index if not exists year_end_progressions_learner_idx on public.year_end_progressions(learner_id, academic_year desc);
create index if not exists year_end_progressions_source_grade_idx on public.year_end_progressions(source_grade_id) where source_grade_id is not null;

-- Examination / DNEA.
create index if not exists examination_candidates_enrolment_idx on public.examination_candidates(enrolment_id);
create index if not exists examination_candidates_learner_idx on public.examination_candidates(learner_id);
create index if not exists examination_subject_registrations_offering_idx on public.examination_subject_registrations(subject_offering_id) where subject_offering_id is not null;
create index if not exists examination_readiness_candidate_idx on public.examination_readiness_issues(candidate_id) where candidate_id is not null;
create index if not exists examination_readiness_subject_idx on public.examination_readiness_issues(subject_registration_id) where subject_registration_id is not null;

-- Finance.
create index if not exists finance_invoice_lines_invoice_idx on public.finance_invoice_lines(invoice_id);
create index if not exists finance_invoice_lines_charge_type_idx on public.finance_invoice_lines(charge_type_id) where charge_type_id is not null;
create index if not exists finance_payments_learner_idx on public.finance_payments(learner_id, paid_on desc) where learner_id is not null;
create index if not exists finance_payment_allocations_payment_idx on public.finance_payment_allocations(payment_id);

-- Assessment and results.
create index if not exists assessment_schemes_offering_idx on public.assessment_schemes(subject_offering_id);
create index if not exists assessment_components_scheme_idx on public.assessment_components(assessment_scheme_id);
create index if not exists assessment_instances_scheme_idx on public.assessment_instances(assessment_scheme_id);
create index if not exists assessment_instances_component_idx on public.assessment_instances(assessment_component_id) where assessment_component_id is not null;
create index if not exists assessment_instances_offering_idx on public.assessment_instances(subject_offering_id);
create index if not exists assessment_instances_teacher_allocation_idx on public.assessment_instances(teacher_allocation_id) where teacher_allocation_id is not null;
create index if not exists learner_marks_enrolment_idx on public.learner_marks(enrolment_id, recorded_at desc);
create index if not exists learner_marks_learner_idx on public.learner_marks(learner_id, recorded_at desc);
create index if not exists learner_marks_replaces_idx on public.learner_marks(replaces_mark_id) where replaces_mark_id is not null;
create index if not exists official_results_enrolment_idx on public.official_results(enrolment_id);
create index if not exists official_results_offering_idx on public.official_results(subject_offering_id);

-- Statutory reporting.
create index if not exists statutory_form_versions_definition_idx on public.statutory_form_versions(form_definition_id);
create index if not exists statutory_reporting_cycles_form_version_idx on public.statutory_reporting_cycles(form_version_id);
create index if not exists statutory_certifications_cycle_idx on public.statutory_certifications(reporting_cycle_id);
create index if not exists statutory_certifications_snapshot_idx on public.statutory_certifications(snapshot_id);

-- Tenant configuration.
create index if not exists tenant_features_tenant_idx on public.tenant_features(tenant_id);
create index if not exists school_settings_tenant_idx on public.school_settings(tenant_id);
create index if not exists tenant_lifecycle_events_actor_idx on public.tenant_lifecycle_events(actor_user_id) where actor_user_id is not null;