create table if not exists public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  requested_grade_id uuid references public.grades(id) on delete restrict,
  applicant_first_names text not null,
  applicant_surname text not null,
  date_of_birth date,
  guardian_name text,
  guardian_contact text,
  previous_school text,
  source text not null default 'school' check (source in ('school','public_form','import','transfer')),
  status text not null default 'received' check (status in ('received','under_review','awaiting_documents','accepted','waitlisted','declined','withdrawn','enrolled')),
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transfer_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  source_school_id uuid not null references public.schools(id) on delete restrict,
  source_enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  destination_school_id uuid references public.schools(id) on delete restrict,
  destination_name text,
  requested_on date not null default current_date,
  effective_on date,
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','completed','cancelled')),
  initiated_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (destination_school_id is not null or nullif(btrim(coalesce(destination_name,'')), '') is not null),
  check (effective_on is null or effective_on >= requested_on)
);

create table if not exists public.year_end_progressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  source_grade_id uuid references public.grades(id) on delete restrict,
  destination_grade_code text,
  outcome text not null check (outcome in ('promoted','not_promoted','condoned','transferred','completed','withdrawn','pending')),
  rule_set_key text,
  rule_set_version text,
  rationale jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','locked')),
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrolment_id)
);

create index if not exists admission_applications_school_year_status_idx on public.admission_applications(school_id, academic_year, status, submitted_at desc);
create index if not exists transfer_events_source_status_idx on public.transfer_events(source_school_id, status, requested_on desc);
create index if not exists transfer_events_learner_idx on public.transfer_events(learner_id, requested_on desc);
create index if not exists year_end_progressions_school_year_idx on public.year_end_progressions(school_id, academic_year, status);

alter table public.admission_applications enable row level security;
alter table public.transfer_events enable row level security;
alter table public.year_end_progressions enable row level security;

create or replace function app_private.can_manage_enrolment_workflow(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal']);
$$;

grant execute on function app_private.can_manage_enrolment_workflow(uuid) to authenticated;

create policy "enrolment managers can read admission applications"
on public.admission_applications for select to authenticated
using (app_private.can_manage_enrolment_workflow(school_id));

create policy "enrolment managers can manage admission applications"
on public.admission_applications for all to authenticated
using (app_private.can_manage_enrolment_workflow(school_id))
with check (app_private.can_manage_enrolment_workflow(school_id));

create policy "authorized source staff can read transfer events"
on public.transfer_events for select to authenticated
using (
  app_private.can_manage_enrolment_workflow(source_school_id)
  or (destination_school_id is not null and app_private.can_manage_enrolment_workflow(destination_school_id))
);

create policy "source enrolment managers can manage transfer events"
on public.transfer_events for all to authenticated
using (app_private.can_manage_enrolment_workflow(source_school_id))
with check (app_private.can_manage_enrolment_workflow(source_school_id));

create policy "academic leaders can read year end progressions"
on public.year_end_progressions for select to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "academic leaders can manage draft progressions"
on public.year_end_progressions for all to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create or replace function public.complete_learner_transfer(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_effective date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_transfer from public.transfer_events where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_transfer.source_school_id) then raise exception 'Permission denied'; end if;
  if v_transfer.status not in ('requested','approved') then raise exception 'Transfer is not open'; end if;

  select * into v_enrolment from public.enrolments where id = v_transfer.source_enrolment_id for update;
  if not found or v_enrolment.learner_id <> v_transfer.learner_id or v_enrolment.school_id <> v_transfer.source_school_id then
    raise exception 'Source enrolment does not match transfer';
  end if;

  v_effective := coalesce(v_transfer.effective_on, current_date);
  if v_effective < v_enrolment.enrolled_from then raise exception 'Transfer date cannot be before enrolment start'; end if;

  update public.enrolments
  set status = 'transferred', enrolled_to = v_effective, updated_at = now()
  where id = v_enrolment.id;

  update public.transfer_events
  set status = 'completed', effective_on = v_effective, approved_by_user_id = coalesce(approved_by_user_id, auth.uid()),
      approved_at = coalesce(approved_at, now()), completed_at = now(), updated_at = now()
  where id = v_transfer.id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_transfer.tenant_id, v_transfer.source_school_id, auth.uid(), 'learner.transfer.completed', 'transfer_event', v_transfer.id,
    jsonb_build_object('learner_id', v_transfer.learner_id, 'effective_on', v_effective, 'destination_school_id', v_transfer.destination_school_id, 'destination_name', v_transfer.destination_name));

  return true;
end;
$$;

create or replace function public.lock_year_end_progression(p_progression_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progression public.year_end_progressions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_progression from public.year_end_progressions where id = p_progression_id for update;
  if not found then raise exception 'Progression decision not found'; end if;
  if not app_private.has_school_role(v_progression.school_id, array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  if v_progression.status <> 'approved' then raise exception 'Only approved progression decisions can be locked'; end if;

  update public.year_end_progressions set status = 'locked', locked_at = now(), updated_at = now() where id = v_progression.id;
  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_progression.tenant_id, v_progression.school_id, auth.uid(), 'progression.locked', 'year_end_progression', v_progression.id,
    jsonb_build_object('outcome', v_progression.outcome, 'rule_set_key', v_progression.rule_set_key, 'rule_set_version', v_progression.rule_set_version));
  return true;
end;
$$;

revoke all on function public.complete_learner_transfer(uuid) from public, anon;
grant execute on function public.complete_learner_transfer(uuid) to authenticated;
revoke all on function public.lock_year_end_progression(uuid) from public, anon;
grant execute on function public.lock_year_end_progression(uuid) to authenticated;

comment on table public.admission_applications is 'Pre-enrolment admissions workflow. Accepted applications do not become learner identities until the governed enrolment action occurs.';
comment on table public.transfer_events is 'Append-oriented learner transfer workflow preserving source-school provenance and historical enrolment.';
comment on table public.year_end_progressions is 'Version-aware year-end outcome record; rule-set provenance is stored rather than recomputed from future rules.';