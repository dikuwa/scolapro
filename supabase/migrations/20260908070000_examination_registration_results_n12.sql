-- N12: frozen examination-registration submissions and governed external-result ingest.
--
-- This migration is additive. It keeps examination_candidates,
-- examination_subject_registrations and official_results as the canonical mutable/input
-- and authoritative-result stores. N12 snapshots are immutable submission evidence;
-- result staging is source-provenanced, non-authoritative and can only be promoted into
-- the existing official_results workflow.

create or replace function app_private.can_manage_n12_examinations(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.role_key in ('school_admin','principal','deputy_principal','exam_officer')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.can_manage_n12_examinations(uuid)
  from public, anon, authenticated;

comment on function app_private.can_manage_n12_examinations(uuid) is
'N12 individual examination-operation boundary. Requires a current school examination-management membership; platform administration and network membership alone never qualify.';

create table public.examination_registration_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  corrects_submission_id uuid null references public.examination_registration_submissions(id) on delete restrict,
  snapshot_schema_version text not null default 'n12.v1' check (btrim(snapshot_schema_version) <> ''),
  frozen_by_user_id uuid not null references auth.users(id) on delete restrict,
  frozen_at timestamptz not null default now(),
  candidate_count integer not null check (candidate_count >= 0),
  subject_registration_count integer not null check (subject_registration_count >= 0),
  unique (school_id, examination_cycle_id, version_number),
  unique (corrects_submission_id)
);

create table public.examination_registration_submission_candidates (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.examination_registration_submissions(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  candidate_number text null,
  candidate_number_provenance text not null default 'examination_candidates.candidate_number',
  legacy_centre_number text null,
  registration_status text not null,
  examination_candidate_centre_assignment_id uuid null references public.examination_candidate_centre_assignments(id) on delete restrict,
  examination_centre_id uuid null references public.examination_centres(id) on delete restrict,
  examination_centre_display_name text null,
  centre_identifier_scheme text null,
  centre_identifier_value text null,
  centre_identifier_source_name text null,
  centre_identifier_source_reference text null,
  centre_assignment_source_name text null,
  centre_assignment_source_reference text null,
  unique (submission_id, candidate_id)
);

create table public.examination_registration_submission_subjects (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.examination_registration_submissions(id) on delete restrict,
  submission_candidate_id uuid not null references public.examination_registration_submission_candidates(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  subject_registration_id uuid not null references public.examination_subject_registrations(id) on delete restrict,
  subject_code text not null,
  subject_name text null,
  subject_offering_id uuid null references public.subject_offerings(id) on delete restrict,
  registration_status text not null,
  unique (submission_id, subject_registration_id)
);

create table public.examination_registration_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.examination_registration_submissions(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  event_type text not null check (event_type in ('prepared','submitted','corrected','withdrawn')),
  external_reference text null check (external_reference is null or btrim(external_reference) <> ''),
  external_reference_source_name text null check (external_reference_source_name is null or btrim(external_reference_source_name) <> ''),
  external_reference_source_reference text null check (external_reference_source_reference is null or btrim(external_reference_source_reference) <> ''),
  note text null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  unique (submission_id, sequence_number),
  check (external_reference is null or external_reference_source_name is not null)
);

create index examination_registration_submissions_cycle_idx
  on public.examination_registration_submissions(school_id, examination_cycle_id, version_number desc);
create index examination_registration_submission_candidates_cycle_idx
  on public.examination_registration_submission_candidates(examination_cycle_id, candidate_id);
create index examination_registration_submission_subjects_registration_idx
  on public.examination_registration_submission_subjects(subject_registration_id);
create index examination_registration_submission_events_idx
  on public.examination_registration_submission_events(submission_id, sequence_number desc);

create table public.examination_result_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  source_received_at timestamptz null,
  source_checksum text null check (source_checksum is null or btrim(source_checksum) <> ''),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.examination_result_import_staging (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.examination_result_import_batches(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  subject_registration_id uuid not null references public.examination_subject_registrations(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  candidate_number text null,
  subject_code text not null,
  term_number smallint null check (term_number between 1 and 6),
  result_value numeric(10,2) null,
  result_status text null check (result_status in ('absent','exempt','incomplete','withheld')),
  symbol text null,
  assessment_scheme_key text not null check (btrim(assessment_scheme_key) <> ''),
  assessment_scheme_version text not null check (btrim(assessment_scheme_version) <> ''),
  academic_rule_set_key text null,
  academic_rule_set_version text null,
  source_row_reference text null check (source_row_reference is null or btrim(source_row_reference) <> ''),
  corrects_staging_id uuid null references public.examination_result_import_staging(id) on delete restrict,
  staged_by_user_id uuid not null references auth.users(id) on delete restrict,
  staged_at timestamptz not null default now(),
  unique (corrects_staging_id),
  check ((result_value is not null)::integer + (result_status is not null)::integer <= 1)
);

create table public.examination_result_import_promotions (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.examination_result_import_batches(id) on delete restrict,
  staging_id uuid not null references public.examination_result_import_staging(id) on delete restrict,
  official_result_id uuid not null references public.official_results(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  promoted_by_user_id uuid not null references auth.users(id) on delete restrict,
  promoted_at timestamptz not null default now(),
  unique (staging_id),
  unique (official_result_id)
);

create index examination_result_import_batches_cycle_idx
  on public.examination_result_import_batches(school_id, examination_cycle_id, created_at desc);
create index examination_result_import_staging_scope_idx
  on public.examination_result_import_staging(import_batch_id, candidate_id, subject_registration_id);
create index examination_result_import_promotions_batch_idx
  on public.examination_result_import_promotions(import_batch_id, promoted_at desc);

alter table public.examination_registration_submissions enable row level security;
alter table public.examination_registration_submission_candidates enable row level security;
alter table public.examination_registration_submission_subjects enable row level security;
alter table public.examination_registration_submission_events enable row level security;
alter table public.examination_result_import_batches enable row level security;
alter table public.examination_result_import_staging enable row level security;
alter table public.examination_result_import_promotions enable row level security;

create policy n12_registration_submissions_read
on public.examination_registration_submissions for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_registration_submission_candidates_read
on public.examination_registration_submission_candidates for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_registration_submission_subjects_read
on public.examination_registration_submission_subjects for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_registration_submission_events_read
on public.examination_registration_submission_events for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_result_import_batches_read
on public.examination_result_import_batches for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_result_import_staging_read
on public.examination_result_import_staging for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));
create policy n12_result_import_promotions_read
on public.examination_result_import_promotions for select to authenticated
using (app_private.can_manage_n12_examinations(school_id));

revoke all on public.examination_registration_submissions from anon, authenticated;
revoke all on public.examination_registration_submission_candidates from anon, authenticated;
revoke all on public.examination_registration_submission_subjects from anon, authenticated;
revoke all on public.examination_registration_submission_events from anon, authenticated;
revoke all on public.examination_result_import_batches from anon, authenticated;
revoke all on public.examination_result_import_staging from anon, authenticated;
revoke all on public.examination_result_import_promotions from anon, authenticated;

grant select on public.examination_registration_submissions to authenticated;
grant select on public.examination_registration_submission_candidates to authenticated;
grant select on public.examination_registration_submission_subjects to authenticated;
grant select on public.examination_registration_submission_events to authenticated;
grant select on public.examination_result_import_batches to authenticated;
grant select on public.examination_result_import_staging to authenticated;
grant select on public.examination_result_import_promotions to authenticated;

create or replace function app_private.assert_n12_cycle_access(p_cycle_id uuid)
returns public.examination_cycles
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle public.examination_cycles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_cycle
  from public.examination_cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'Examination cycle not found';
  end if;

  if not app_private.can_manage_n12_examinations(v_cycle.school_id) then
    raise exception 'Permission denied';
  end if;

  return v_cycle;
end;
$$;

revoke all on function app_private.assert_n12_cycle_access(uuid)
  from public, anon, authenticated;

create or replace function app_private.assert_n12_cycle_ready(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.rebuild_examination_readiness(p_cycle_id);

  if exists (
    select 1
    from public.examination_readiness_issues ri
    where ri.examination_cycle_id = p_cycle_id
      and ri.resolved = false
      and ri.severity = 'blocking'
  ) then
    raise exception 'Examination cycle has unresolved blocking readiness issues';
  end if;
end;
$$;

revoke all on function app_private.assert_n12_cycle_ready(uuid)
  from public, anon, authenticated;

create or replace function app_private.populate_n12_registration_snapshot(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.examination_registration_submissions%rowtype;
begin
  select * into v_submission
  from public.examination_registration_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Registration submission not found';
  end if;

  insert into public.examination_registration_submission_candidates (
    submission_id, tenant_id, school_id, examination_cycle_id,
    candidate_id, learner_id, enrolment_id, candidate_number,
    legacy_centre_number, registration_status,
    examination_candidate_centre_assignment_id, examination_centre_id,
    examination_centre_display_name, centre_identifier_scheme,
    centre_identifier_value, centre_identifier_source_name,
    centre_identifier_source_reference, centre_assignment_source_name,
    centre_assignment_source_reference
  )
  select
    v_submission.id, ec.tenant_id, ec.school_id, ec.examination_cycle_id,
    ec.id, ec.learner_id, ec.enrolment_id, ec.candidate_number,
    ec.centre_number, ec.registration_status,
    centre_assignment.id, centre_assignment.examination_centre_id,
    centre_assignment.centre_display_name, centre_assignment.identifier_scheme,
    centre_assignment.identifier_value, centre_assignment.identifier_source_name,
    centre_assignment.identifier_source_reference, centre_assignment.assignment_source_name,
    centre_assignment.assignment_source_reference
  from public.examination_candidates ec
  left join lateral (
    select
      a.id,
      a.examination_centre_id,
      xc.display_name as centre_display_name,
      ih.identifier_scheme,
      ih.identifier_value,
      ih.source_name as identifier_source_name,
      ih.source_reference as identifier_source_reference,
      a.source_name as assignment_source_name,
      a.source_reference as assignment_source_reference
    from public.examination_candidate_centre_assignments a
    join public.examination_centres xc on xc.id = a.examination_centre_id
    left join lateral (
      select h.identifier_scheme, h.identifier_value, h.source_name, h.source_reference
      from public.examination_centre_identifier_history h
      where h.examination_centre_id = a.examination_centre_id
        and h.effective_from <= v_submission.frozen_at::date
        and (h.effective_to is null or h.effective_to >= v_submission.frozen_at::date)
      order by h.effective_from desc, h.id
      limit 1
    ) ih on true
    where a.candidate_id = ec.id
      and a.examination_cycle_id = ec.examination_cycle_id
      and a.effective_from <= v_submission.frozen_at::date
      and (a.effective_to is null or a.effective_to >= v_submission.frozen_at::date)
    order by a.effective_from desc, a.id
    limit 1
  ) centre_assignment on true
  where ec.examination_cycle_id = v_submission.examination_cycle_id
    and ec.tenant_id = v_submission.tenant_id
    and ec.school_id = v_submission.school_id
    and ec.registration_status <> 'withdrawn';

  insert into public.examination_registration_submission_subjects (
    submission_id, submission_candidate_id, tenant_id, school_id,
    examination_cycle_id, candidate_id, subject_registration_id,
    subject_code, subject_name, subject_offering_id, registration_status
  )
  select
    v_submission.id, sc.id, esr.tenant_id, esr.school_id,
    sc.examination_cycle_id, sc.candidate_id, esr.id,
    esr.subject_code, esr.subject_name, esr.subject_offering_id, esr.registration_status
  from public.examination_registration_submission_candidates sc
  join public.examination_subject_registrations esr
    on esr.candidate_id = sc.candidate_id
  where sc.submission_id = v_submission.id
    and esr.tenant_id = v_submission.tenant_id
    and esr.school_id = v_submission.school_id
    and esr.registration_status <> 'withdrawn';
end;
$$;

revoke all on function app_private.populate_n12_registration_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.freeze_examination_registration_submission(p_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_submission_id uuid;
  v_candidate_count integer;
  v_subject_count integer;
begin
  v_cycle := app_private.assert_n12_cycle_access(p_cycle_id);
  perform app_private.assert_n12_cycle_ready(p_cycle_id);

  if exists (
    select 1 from public.examination_registration_submissions s
    where s.examination_cycle_id = p_cycle_id and s.school_id = v_cycle.school_id
  ) then
    raise exception 'Registration submission already exists; use correction workflow';
  end if;

  select count(*)::integer into v_candidate_count
  from public.examination_candidates ec
  where ec.examination_cycle_id = p_cycle_id
    and ec.registration_status <> 'withdrawn';

  select count(*)::integer into v_subject_count
  from public.examination_subject_registrations esr
  join public.examination_candidates ec on ec.id = esr.candidate_id
  where ec.examination_cycle_id = p_cycle_id
    and ec.registration_status <> 'withdrawn'
    and esr.registration_status <> 'withdrawn';

  insert into public.examination_registration_submissions (
    tenant_id, school_id, examination_cycle_id, version_number,
    frozen_by_user_id, candidate_count, subject_registration_count
  ) values (
    v_cycle.tenant_id, v_cycle.school_id, v_cycle.id, 1,
    auth.uid(), v_candidate_count, v_subject_count
  ) returning id into v_submission_id;

  perform app_private.populate_n12_registration_snapshot(v_submission_id);

  insert into public.examination_registration_submission_events (
    submission_id, tenant_id, school_id, examination_cycle_id,
    sequence_number, event_type, actor_user_id
  ) values (
    v_submission_id, v_cycle.tenant_id, v_cycle.school_id, v_cycle.id,
    1, 'prepared', auth.uid()
  );

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_cycle.tenant_id, v_cycle.school_id, auth.uid(),
    'examination_registration.submission.frozen', 'examination_registration_submission',
    v_submission_id,
    jsonb_build_object('examination_cycle_id', v_cycle.id, 'version_number', 1,
      'candidate_count', v_candidate_count, 'subject_registration_count', v_subject_count)
  );

  return v_submission_id;
end;
$$;

revoke all on function public.freeze_examination_registration_submission(uuid) from public, anon;
grant execute on function public.freeze_examination_registration_submission(uuid) to authenticated;

create or replace function public.correct_examination_registration_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_prior public.examination_registration_submissions%rowtype;
  v_cycle public.examination_cycles%rowtype;
  v_last_event text;
  v_new_id uuid;
  v_next_version integer;
  v_candidate_count integer;
  v_subject_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_prior
  from public.examination_registration_submissions
  where id = p_submission_id
  for update;

  if not found then raise exception 'Registration submission not found'; end if;
  if not app_private.can_manage_n12_examinations(v_prior.school_id) then raise exception 'Permission denied'; end if;

  select e.event_type into v_last_event
  from public.examination_registration_submission_events e
  where e.submission_id = v_prior.id
  order by e.sequence_number desc
  limit 1;

  if v_last_event <> 'submitted' then
    raise exception 'Only a submitted registration version can be corrected';
  end if;

  if exists (
    select 1 from public.examination_registration_submissions s
    where s.corrects_submission_id = v_prior.id
  ) then
    raise exception 'Registration submission version already has a correction';
  end if;

  v_cycle := app_private.assert_n12_cycle_access(v_prior.examination_cycle_id);
  perform app_private.assert_n12_cycle_ready(v_prior.examination_cycle_id);

  select coalesce(max(s.version_number),0) + 1 into v_next_version
  from public.examination_registration_submissions s
  where s.school_id = v_prior.school_id
    and s.examination_cycle_id = v_prior.examination_cycle_id;

  select count(*)::integer into v_candidate_count
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_prior.examination_cycle_id
    and ec.registration_status <> 'withdrawn';

  select count(*)::integer into v_subject_count
  from public.examination_subject_registrations esr
  join public.examination_candidates ec on ec.id = esr.candidate_id
  where ec.examination_cycle_id = v_prior.examination_cycle_id
    and ec.registration_status <> 'withdrawn'
    and esr.registration_status <> 'withdrawn';

  insert into public.examination_registration_submissions (
    tenant_id, school_id, examination_cycle_id, version_number,
    corrects_submission_id, frozen_by_user_id, candidate_count,
    subject_registration_count
  ) values (
    v_prior.tenant_id, v_prior.school_id, v_prior.examination_cycle_id, v_next_version,
    v_prior.id, auth.uid(), v_candidate_count, v_subject_count
  ) returning id into v_new_id;

  perform app_private.populate_n12_registration_snapshot(v_new_id);

  insert into public.examination_registration_submission_events (
    submission_id, tenant_id, school_id, examination_cycle_id,
    sequence_number, event_type, actor_user_id
  )
  select v_prior.id, v_prior.tenant_id, v_prior.school_id, v_prior.examination_cycle_id,
    coalesce(max(e.sequence_number),0)+1, 'corrected', auth.uid()
  from public.examination_registration_submission_events e
  where e.submission_id = v_prior.id;

  insert into public.examination_registration_submission_events (
    submission_id, tenant_id, school_id, examination_cycle_id,
    sequence_number, event_type, actor_user_id
  ) values (
    v_new_id, v_prior.tenant_id, v_prior.school_id, v_prior.examination_cycle_id,
    1, 'prepared', auth.uid()
  );

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_prior.tenant_id, v_prior.school_id, auth.uid(),
    'examination_registration.submission.corrected', 'examination_registration_submission',
    v_new_id,
    jsonb_build_object('examination_cycle_id', v_prior.examination_cycle_id,
      'version_number', v_next_version, 'corrects_submission_id', v_prior.id,
      'candidate_count', v_candidate_count, 'subject_registration_count', v_subject_count)
  );

  return v_new_id;
end;
$$;

revoke all on function public.correct_examination_registration_submission(uuid) from public, anon;
grant execute on function public.correct_examination_registration_submission(uuid) to authenticated;

create or replace function public.transition_examination_registration_submission(
  p_submission_id uuid,
  p_event_type text,
  p_external_reference text default null,
  p_external_reference_source_name text default null,
  p_external_reference_source_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_submission public.examination_registration_submissions%rowtype;
  v_last_event text;
  v_next_sequence integer;
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_submission
  from public.examination_registration_submissions
  where id = p_submission_id
  for update;

  if not found then raise exception 'Registration submission not found'; end if;
  if not app_private.can_manage_n12_examinations(v_submission.school_id) then raise exception 'Permission denied'; end if;
  if p_event_type not in ('submitted','withdrawn') then raise exception 'Invalid registration submission transition'; end if;
  if p_external_reference is not null and nullif(btrim(p_external_reference_source_name),'') is null then
    raise exception 'External reference source name is required';
  end if;

  select e.event_type, e.sequence_number + 1
    into v_last_event, v_next_sequence
  from public.examination_registration_submission_events e
  where e.submission_id = v_submission.id
  order by e.sequence_number desc
  limit 1;

  if p_event_type = 'submitted' then
    if v_last_event <> 'prepared' then raise exception 'Only a prepared registration version can be submitted'; end if;
    perform app_private.assert_n12_cycle_ready(v_submission.examination_cycle_id);
  elsif p_event_type = 'withdrawn' then
    if v_last_event not in ('prepared','submitted') then raise exception 'Registration version cannot be withdrawn from its current state'; end if;
  end if;

  insert into public.examination_registration_submission_events (
    submission_id, tenant_id, school_id, examination_cycle_id,
    sequence_number, event_type, external_reference,
    external_reference_source_name, external_reference_source_reference,
    note, actor_user_id
  ) values (
    v_submission.id, v_submission.tenant_id, v_submission.school_id,
    v_submission.examination_cycle_id, v_next_sequence, p_event_type,
    nullif(btrim(p_external_reference),''), nullif(btrim(p_external_reference_source_name),''),
    nullif(btrim(p_external_reference_source_reference),''), p_note, auth.uid()
  ) returning id into v_event_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_submission.tenant_id, v_submission.school_id, auth.uid(),
    'examination_registration.submission.' || p_event_type,
    'examination_registration_submission', v_submission.id,
    jsonb_build_object('examination_cycle_id', v_submission.examination_cycle_id,
      'version_number', v_submission.version_number,
      'has_external_reference', p_external_reference is not null)
  );

  return v_event_id;
end;
$$;

revoke all on function public.transition_examination_registration_submission(uuid,text,text,text,text,text)
  from public, anon;
grant execute on function public.transition_examination_registration_submission(uuid,text,text,text,text,text)
  to authenticated;

create or replace function public.create_examination_result_import_batch(
  p_cycle_id uuid,
  p_source_name text,
  p_source_reference text default null,
  p_source_received_at timestamptz default null,
  p_source_checksum text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_batch_id uuid;
begin
  v_cycle := app_private.assert_n12_cycle_access(p_cycle_id);
  if nullif(btrim(p_source_name),'') is null then raise exception 'Result import source name is required'; end if;

  insert into public.examination_result_import_batches (
    tenant_id, school_id, examination_cycle_id, source_name, source_reference,
    source_received_at, source_checksum, created_by_user_id
  ) values (
    v_cycle.tenant_id, v_cycle.school_id, v_cycle.id, btrim(p_source_name),
    nullif(btrim(p_source_reference),''), p_source_received_at,
    nullif(btrim(p_source_checksum),''), auth.uid()
  ) returning id into v_batch_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_cycle.tenant_id, v_cycle.school_id, auth.uid(),
    'examination_results.import_batch.created', 'examination_result_import_batch',
    v_batch_id, jsonb_build_object('examination_cycle_id', v_cycle.id, 'source_name', btrim(p_source_name))
  );

  return v_batch_id;
end;
$$;

revoke all on function public.create_examination_result_import_batch(uuid,text,text,timestamptz,text)
  from public, anon;
grant execute on function public.create_examination_result_import_batch(uuid,text,text,timestamptz,text)
  to authenticated;

create or replace function public.stage_examination_result_import(
  p_import_batch_id uuid,
  p_candidate_id uuid,
  p_subject_registration_id uuid,
  p_term_number smallint,
  p_result_value numeric,
  p_result_status text,
  p_symbol text,
  p_assessment_scheme_key text,
  p_assessment_scheme_version text,
  p_academic_rule_set_key text default null,
  p_academic_rule_set_version text default null,
  p_source_row_reference text default null,
  p_corrects_staging_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_batch public.examination_result_import_batches%rowtype;
  v_candidate public.examination_candidates%rowtype;
  v_subject public.examination_subject_registrations%rowtype;
  v_prior public.examination_result_import_staging%rowtype;
  v_staging_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_batch from public.examination_result_import_batches where id = p_import_batch_id;
  if not found then raise exception 'Result import batch not found'; end if;
  if not app_private.can_manage_n12_examinations(v_batch.school_id) then raise exception 'Permission denied'; end if;

  select * into v_candidate from public.examination_candidates where id = p_candidate_id;
  if not found
     or (v_candidate.tenant_id, v_candidate.school_id, v_candidate.examination_cycle_id)
        is distinct from (v_batch.tenant_id, v_batch.school_id, v_batch.examination_cycle_id)
     or v_candidate.registration_status = 'withdrawn' then
    raise exception 'Result import scope mismatch: candidate does not match batch tenant, school, and cycle';
  end if;

  select * into v_subject from public.examination_subject_registrations where id = p_subject_registration_id;
  if not found
     or (v_subject.tenant_id, v_subject.school_id, v_subject.candidate_id)
        is distinct from (v_batch.tenant_id, v_batch.school_id, v_candidate.id)
     or v_subject.registration_status = 'withdrawn'
     or v_subject.subject_offering_id is null then
    raise exception 'Result import scope mismatch: subject registration does not match candidate and school';
  end if;

  if nullif(btrim(p_assessment_scheme_key),'') is null or nullif(btrim(p_assessment_scheme_version),'') is null then
    raise exception 'Assessment scheme provenance is required';
  end if;
  if (p_result_value is not null)::integer + (p_result_status is not null)::integer > 1 then
    raise exception 'Result value and result status are mutually exclusive';
  end if;
  if p_result_status is not null and p_result_status not in ('absent','exempt','incomplete','withheld') then
    raise exception 'Invalid result status';
  end if;
  if p_term_number is not null and (p_term_number < 1 or p_term_number > 6) then
    raise exception 'Invalid term number';
  end if;

  if p_corrects_staging_id is not null then
    select * into v_prior
    from public.examination_result_import_staging
    where id = p_corrects_staging_id;
    if not found
       or (v_prior.import_batch_id, v_prior.candidate_id, v_prior.subject_registration_id)
          is distinct from (v_batch.id, v_candidate.id, v_subject.id) then
      raise exception 'Result correction provenance does not match batch, candidate, and subject registration';
    end if;
    if exists (select 1 from public.examination_result_import_staging s where s.corrects_staging_id = v_prior.id) then
      raise exception 'Result staging row already has a correction';
    end if;
  end if;

  insert into public.examination_result_import_staging (
    import_batch_id, tenant_id, school_id, examination_cycle_id,
    candidate_id, subject_registration_id, enrolment_id, learner_id,
    subject_offering_id, candidate_number, subject_code, term_number,
    result_value, result_status, symbol, assessment_scheme_key,
    assessment_scheme_version, academic_rule_set_key, academic_rule_set_version,
    source_row_reference, corrects_staging_id, staged_by_user_id
  ) values (
    v_batch.id, v_batch.tenant_id, v_batch.school_id, v_batch.examination_cycle_id,
    v_candidate.id, v_subject.id, v_candidate.enrolment_id, v_candidate.learner_id,
    v_subject.subject_offering_id, v_candidate.candidate_number, v_subject.subject_code,
    p_term_number, p_result_value, p_result_status, p_symbol,
    btrim(p_assessment_scheme_key), btrim(p_assessment_scheme_version),
    nullif(btrim(p_academic_rule_set_key),''), nullif(btrim(p_academic_rule_set_version),''),
    nullif(btrim(p_source_row_reference),''), p_corrects_staging_id, auth.uid()
  ) returning id into v_staging_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_batch.tenant_id, v_batch.school_id, auth.uid(),
    case when p_corrects_staging_id is null then 'examination_results.import_row.staged'
         else 'examination_results.import_row.corrected' end,
    'examination_result_import_staging', v_staging_id,
    jsonb_build_object('import_batch_id', v_batch.id, 'examination_cycle_id', v_batch.examination_cycle_id,
      'candidate_id', v_candidate.id, 'subject_registration_id', v_subject.id,
      'corrects_staging_id', p_corrects_staging_id)
  );

  return v_staging_id;
end;
$$;

revoke all on function public.stage_examination_result_import(uuid,uuid,uuid,smallint,numeric,text,text,text,text,text,text,text,uuid)
  from public, anon;
grant execute on function public.stage_examination_result_import(uuid,uuid,uuid,smallint,numeric,text,text,text,text,text,text,text,uuid)
  to authenticated;

create or replace function public.promote_examination_result_import(p_staging_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_stage public.examination_result_import_staging%rowtype;
  v_batch public.examination_result_import_batches%rowtype;
  v_cycle public.examination_cycles%rowtype;
  v_official_result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_stage
  from public.examination_result_import_staging
  where id = p_staging_id
  for update;

  if not found then raise exception 'Result staging row not found'; end if;
  if not app_private.can_manage_n12_examinations(v_stage.school_id) then raise exception 'Permission denied'; end if;

  if not app_private.user_is_academic_leader(auth.uid(), v_stage.school_id) then
    raise exception 'Official result promotion requires school academic-result approval authority';
  end if;

  if exists (select 1 from public.examination_result_import_promotions p where p.staging_id = v_stage.id) then
    raise exception 'Result staging row has already been promoted';
  end if;
  if exists (select 1 from public.examination_result_import_staging s where s.corrects_staging_id = v_stage.id) then
    raise exception 'Superseded result staging row cannot be promoted';
  end if;

  select * into v_batch from public.examination_result_import_batches where id = v_stage.import_batch_id;
  if not found
     or (v_batch.tenant_id, v_batch.school_id, v_batch.examination_cycle_id)
        is distinct from (v_stage.tenant_id, v_stage.school_id, v_stage.examination_cycle_id) then
    raise exception 'Result import batch scope mismatch';
  end if;

  select * into v_cycle from public.examination_cycles where id = v_stage.examination_cycle_id;
  if not found
     or (v_cycle.tenant_id, v_cycle.school_id)
        is distinct from (v_stage.tenant_id, v_stage.school_id) then
    raise exception 'Result import examination cycle scope mismatch';
  end if;

  if not exists (
    select 1
    from public.examination_candidates ec
    join public.examination_subject_registrations esr on esr.id = v_stage.subject_registration_id
    where ec.id = v_stage.candidate_id
      and ec.tenant_id = v_stage.tenant_id
      and ec.school_id = v_stage.school_id
      and ec.examination_cycle_id = v_stage.examination_cycle_id
      and ec.enrolment_id = v_stage.enrolment_id
      and ec.learner_id = v_stage.learner_id
      and esr.candidate_id = ec.id
      and esr.tenant_id = v_stage.tenant_id
      and esr.school_id = v_stage.school_id
      and esr.subject_offering_id = v_stage.subject_offering_id
  ) then
    raise exception 'Result import canonical candidate or subject scope changed';
  end if;

  insert into public.official_results (
    tenant_id, school_id, academic_year, enrolment_id, learner_id,
    subject_offering_id, term_number, result_value, result_status, symbol,
    assessment_scheme_key, assessment_scheme_version,
    academic_rule_set_key, academic_rule_set_version,
    calculation_snapshot, approved_by_user_id
  ) values (
    v_stage.tenant_id, v_stage.school_id, v_cycle.academic_year,
    v_stage.enrolment_id, v_stage.learner_id, v_stage.subject_offering_id,
    v_stage.term_number, v_stage.result_value, v_stage.result_status, v_stage.symbol,
    v_stage.assessment_scheme_key, v_stage.assessment_scheme_version,
    v_stage.academic_rule_set_key, v_stage.academic_rule_set_version,
    jsonb_build_object(
      'source_type', 'external_examination_result_import',
      'import_batch_id', v_batch.id,
      'staging_id', v_stage.id,
      'source_name', v_batch.source_name,
      'source_reference', v_batch.source_reference,
      'source_row_reference', v_stage.source_row_reference,
      'candidate_id', v_stage.candidate_id,
      'subject_registration_id', v_stage.subject_registration_id,
      'corrects_staging_id', v_stage.corrects_staging_id
    ),
    auth.uid()
  ) returning id into v_official_result_id;

  insert into public.examination_result_import_promotions (
    import_batch_id, staging_id, official_result_id,
    tenant_id, school_id, examination_cycle_id, promoted_by_user_id
  ) values (
    v_batch.id, v_stage.id, v_official_result_id,
    v_stage.tenant_id, v_stage.school_id, v_stage.examination_cycle_id, auth.uid()
  );

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_stage.tenant_id, v_stage.school_id, auth.uid(),
    'examination_results.import_row.promoted', 'official_result', v_official_result_id,
    jsonb_build_object('import_batch_id', v_batch.id, 'staging_id', v_stage.id,
      'examination_cycle_id', v_stage.examination_cycle_id,
      'candidate_id', v_stage.candidate_id,
      'subject_registration_id', v_stage.subject_registration_id)
  );

  return v_official_result_id;
end;
$$;

revoke all on function public.promote_examination_result_import(uuid) from public, anon;
grant execute on function public.promote_examination_result_import(uuid) to authenticated;

comment on table public.examination_registration_submissions is
'N12 immutable version headers for frozen examination-registration submissions. Corrections create a new version; canonical candidates and registrations remain the source of current truth.';
comment on table public.examination_registration_submission_candidates is
'N12 immutable candidate submission evidence. It snapshots only examination-registration facts and centre provenance required for historical reproduction; N10/SEN/support details are deliberately excluded.';
comment on table public.examination_registration_submission_subjects is
'N12 immutable subject-registration submission evidence referencing canonical examination subject registrations.';
comment on table public.examination_registration_submission_events is
'N12 append-only generic submission lifecycle and nullable source-provenanced external receipt/reference history. No DNEA acknowledgement codes are invented.';
comment on table public.examination_result_import_batches is
'N12 source-provenanced metadata for externally supplied examination-result imports.';
comment on table public.examination_result_import_staging is
'N12 append-only non-authoritative validation staging for external examination results. Rows cannot be edited or published directly; authoritative results remain public.official_results.';
comment on table public.examination_result_import_promotions is
'N12 immutable provenance link from a validated staging row to the canonical public.official_results row created through governed promotion.';
