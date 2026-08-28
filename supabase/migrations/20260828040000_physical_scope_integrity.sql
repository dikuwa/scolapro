create or replace function app_private.enforce_parent_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_id uuid;
  v_parent_tenant uuid;
  v_parent_school uuid;
  v_sql text;
begin
  v_parent_id := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  if v_parent_id is null then
    if tg_argv[3] = 'nullable' then return new; end if;
    raise exception '% is required', tg_argv[0];
  end if;

  v_sql := format('select tenant_id, school_id from %s where id = $1', tg_argv[1]::regclass);
  execute v_sql into v_parent_tenant, v_parent_school using v_parent_id;
  if v_parent_tenant is null then raise exception 'Referenced % record does not exist', tg_argv[1]; end if;

  if new.tenant_id is distinct from v_parent_tenant then
    raise exception 'Tenant scope mismatch for %', tg_argv[0];
  end if;
  if new.school_id is distinct from v_parent_school then
    raise exception 'School scope mismatch for %', tg_argv[0];
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_parent_scope() from public, anon, authenticated;

-- Assessment chain.
drop trigger if exists assessment_components_scope_guard on public.assessment_components;
create trigger assessment_components_scope_guard before insert or update on public.assessment_components
for each row execute function app_private.enforce_parent_scope('assessment_scheme_id','public.assessment_schemes','school_id','required');

drop trigger if exists assessment_instances_scheme_scope_guard on public.assessment_instances;
create trigger assessment_instances_scheme_scope_guard before insert or update on public.assessment_instances
for each row execute function app_private.enforce_parent_scope('assessment_scheme_id','public.assessment_schemes','school_id','required');

drop trigger if exists assessment_instances_offering_scope_guard on public.assessment_instances;
create trigger assessment_instances_offering_scope_guard before insert or update on public.assessment_instances
for each row execute function app_private.enforce_parent_scope('subject_offering_id','public.subject_offerings','school_id','required');

drop trigger if exists assessment_instances_class_scope_guard on public.assessment_instances;
create trigger assessment_instances_class_scope_guard before insert or update on public.assessment_instances
for each row execute function app_private.enforce_parent_scope('register_class_id','public.register_classes','school_id','required');

drop trigger if exists learner_marks_instance_scope_guard on public.learner_marks;
create trigger learner_marks_instance_scope_guard before insert or update on public.learner_marks
for each row execute function app_private.enforce_parent_scope('assessment_instance_id','public.assessment_instances','school_id','required');

drop trigger if exists learner_marks_enrolment_scope_guard on public.learner_marks;
create trigger learner_marks_enrolment_scope_guard before insert or update on public.learner_marks
for each row execute function app_private.enforce_parent_scope('enrolment_id','public.enrolments','school_id','required');

drop trigger if exists mark_submissions_instance_scope_guard on public.mark_submissions;
create trigger mark_submissions_instance_scope_guard before insert or update on public.mark_submissions
for each row execute function app_private.enforce_parent_scope('assessment_instance_id','public.assessment_instances','school_id','required');

drop trigger if exists official_results_enrolment_scope_guard on public.official_results;
create trigger official_results_enrolment_scope_guard before insert or update on public.official_results
for each row execute function app_private.enforce_parent_scope('enrolment_id','public.enrolments','school_id','required');

drop trigger if exists official_results_offering_scope_guard on public.official_results;
create trigger official_results_offering_scope_guard before insert or update on public.official_results
for each row execute function app_private.enforce_parent_scope('subject_offering_id','public.subject_offerings','school_id','required');

-- LTSM chain.
drop trigger if exists learning_resource_copies_title_scope_guard on public.learning_resource_copies;
create trigger learning_resource_copies_title_scope_guard before insert or update on public.learning_resource_copies
for each row execute function app_private.enforce_parent_scope('title_id','public.learning_resource_titles','school_id','required');

drop trigger if exists learning_resource_loans_copy_scope_guard on public.learning_resource_loans;
create trigger learning_resource_loans_copy_scope_guard before insert or update on public.learning_resource_loans
for each row execute function app_private.enforce_parent_scope('copy_id','public.learning_resource_copies','school_id','required');

-- Communications chain.
drop trigger if exists communication_recipients_message_scope_guard on public.communication_recipients;
create trigger communication_recipients_message_scope_guard before insert or update on public.communication_recipients
for each row execute function app_private.enforce_parent_scope('message_id','public.communication_messages','school_id','required');

-- Examination chain.
drop trigger if exists examination_candidates_cycle_scope_guard on public.examination_candidates;
create trigger examination_candidates_cycle_scope_guard before insert or update on public.examination_candidates
for each row execute function app_private.enforce_parent_scope('examination_cycle_id','public.examination_cycles','school_id','required');

drop trigger if exists examination_candidates_enrolment_scope_guard on public.examination_candidates;
create trigger examination_candidates_enrolment_scope_guard before insert or update on public.examination_candidates
for each row execute function app_private.enforce_parent_scope('enrolment_id','public.enrolments','school_id','required');

drop trigger if exists examination_subject_candidate_scope_guard on public.examination_subject_registrations;
create trigger examination_subject_candidate_scope_guard before insert or update on public.examination_subject_registrations
for each row execute function app_private.enforce_parent_scope('candidate_id','public.examination_candidates','school_id','required');

drop trigger if exists examination_subject_offering_scope_guard on public.examination_subject_registrations;
create trigger examination_subject_offering_scope_guard before insert or update on public.examination_subject_registrations
for each row execute function app_private.enforce_parent_scope('subject_offering_id','public.subject_offerings','school_id','nullable');

-- Finance chain.
drop trigger if exists finance_invoice_lines_invoice_scope_guard on public.finance_invoice_lines;
create trigger finance_invoice_lines_invoice_scope_guard before insert or update on public.finance_invoice_lines
for each row execute function app_private.enforce_parent_scope('invoice_id','public.finance_invoices','school_id','required');

drop trigger if exists finance_payment_allocations_payment_scope_guard on public.finance_payment_allocations;
create trigger finance_payment_allocations_payment_scope_guard before insert or update on public.finance_payment_allocations
for each row execute function app_private.enforce_parent_scope('payment_id','public.finance_payments','school_id','required');

drop trigger if exists finance_payment_allocations_invoice_scope_guard on public.finance_payment_allocations;
create trigger finance_payment_allocations_invoice_scope_guard before insert or update on public.finance_payment_allocations
for each row execute function app_private.enforce_parent_scope('invoice_id','public.finance_invoices','school_id','required');

-- Statutory chain.
drop trigger if exists statutory_snapshots_cycle_scope_guard on public.statutory_snapshots;
create trigger statutory_snapshots_cycle_scope_guard before insert or update on public.statutory_snapshots
for each row execute function app_private.enforce_parent_scope('reporting_cycle_id','public.statutory_reporting_cycles','school_id','required');

drop trigger if exists statutory_issues_cycle_scope_guard on public.statutory_readiness_issues;
create trigger statutory_issues_cycle_scope_guard before insert or update on public.statutory_readiness_issues
for each row execute function app_private.enforce_parent_scope('reporting_cycle_id','public.statutory_reporting_cycles','school_id','required');

drop trigger if exists statutory_certifications_cycle_scope_guard on public.statutory_certifications;
create trigger statutory_certifications_cycle_scope_guard before insert or update on public.statutory_certifications
for each row execute function app_private.enforce_parent_scope('reporting_cycle_id','public.statutory_reporting_cycles','school_id','required');

drop trigger if exists statutory_certifications_snapshot_scope_guard on public.statutory_certifications;
create trigger statutory_certifications_snapshot_scope_guard before insert or update on public.statutory_certifications
for each row execute function app_private.enforce_parent_scope('snapshot_id','public.statutory_snapshots','school_id','required');

-- Progression and transfer provenance.
drop trigger if exists year_end_progressions_enrolment_scope_guard on public.year_end_progressions;
create trigger year_end_progressions_enrolment_scope_guard before insert or update on public.year_end_progressions
for each row execute function app_private.enforce_parent_scope('enrolment_id','public.enrolments','school_id','required');

create or replace function app_private.enforce_transfer_source_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrolment public.enrolments%rowtype;
begin
  select * into v_enrolment from public.enrolments where id = new.source_enrolment_id;
  if not found then raise exception 'Source enrolment not found'; end if;
  if new.tenant_id <> v_enrolment.tenant_id or new.source_school_id <> v_enrolment.school_id or new.learner_id <> v_enrolment.learner_id then
    raise exception 'Transfer source scope does not match the source enrolment';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_transfer_source_scope() from public, anon, authenticated;
drop trigger if exists transfer_source_scope_guard on public.transfer_events;
create trigger transfer_source_scope_guard before insert or update on public.transfer_events
for each row execute function app_private.enforce_transfer_source_scope();

-- Mark consistency checks that cannot be expressed as ordinary FKs.
create or replace function app_private.enforce_mark_identity_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_instance public.assessment_instances%rowtype;
begin
  select * into v_enrolment from public.enrolments where id = new.enrolment_id;
  select * into v_instance from public.assessment_instances where id = new.assessment_instance_id;
  if new.learner_id <> v_enrolment.learner_id then raise exception 'Mark learner does not match enrolment'; end if;
  if v_enrolment.register_class_id <> v_instance.register_class_id or v_enrolment.academic_year <> v_instance.academic_year then
    raise exception 'Mark enrolment is outside the assessment class or academic year';
  end if;
  if new.numeric_mark is not null and v_instance.raw_max is not null and (new.numeric_mark < 0 or new.numeric_mark > v_instance.raw_max) then
    raise exception 'Numeric mark is outside the assessment range';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_mark_identity_scope() from public, anon, authenticated;
drop trigger if exists learner_marks_identity_scope_guard on public.learner_marks;
create trigger learner_marks_identity_scope_guard before insert or update on public.learner_marks
for each row execute function app_private.enforce_mark_identity_scope();

comment on function app_private.enforce_parent_scope() is 'Generic defense-in-depth trigger preventing child records from crossing tenant or school boundaries of their authoritative parent record.';