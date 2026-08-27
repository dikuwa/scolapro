create table if not exists public.examination_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  cycle_key text not null,
  display_name text not null,
  authority text not null default 'DNEA',
  registration_opens_on date,
  registration_closes_on date,
  examination_starts_on date,
  examination_ends_on date,
  status text not null default 'setup' check (status in ('setup','open','closed','submitted','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, cycle_key),
  check (registration_closes_on is null or registration_opens_on is null or registration_closes_on >= registration_opens_on),
  check (examination_ends_on is null or examination_starts_on is null or examination_ends_on >= examination_starts_on)
);

create table if not exists public.examination_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  candidate_number text,
  centre_number text,
  registration_status text not null default 'draft' check (registration_status in ('draft','ready','submitted','accepted','returned','withdrawn')),
  identity_verified boolean not null default false,
  identity_issue text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (examination_cycle_id, learner_id),
  unique (examination_cycle_id, candidate_number)
);

create table if not exists public.examination_subject_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete cascade,
  subject_code text not null,
  subject_name text,
  subject_offering_id uuid references public.subject_offerings(id) on delete restrict,
  registration_status text not null default 'draft' check (registration_status in ('draft','ready','submitted','accepted','returned','withdrawn')),
  issue_code text,
  issue_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, subject_code)
);

create table if not exists public.examination_readiness_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete cascade,
  candidate_id uuid references public.examination_candidates(id) on delete cascade,
  subject_registration_id uuid references public.examination_subject_registrations(id) on delete cascade,
  issue_code text not null,
  severity text not null default 'blocking' check (severity in ('info','warning','blocking')),
  message text not null,
  resolved boolean not null default false,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists examination_candidates_cycle_status_idx on public.examination_candidates(examination_cycle_id, registration_status);
create index if not exists examination_subject_candidate_idx on public.examination_subject_registrations(candidate_id, registration_status);
create index if not exists examination_readiness_cycle_idx on public.examination_readiness_issues(examination_cycle_id, resolved, severity);

alter table public.examination_cycles enable row level security;
alter table public.examination_candidates enable row level security;
alter table public.examination_subject_registrations enable row level security;
alter table public.examination_readiness_issues enable row level security;

create or replace function app_private.can_manage_examinations(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal','exam_officer']);
$$;

grant execute on function app_private.can_manage_examinations(uuid) to authenticated;

create policy "exam staff can read examination cycles" on public.examination_cycles for select to authenticated using (app_private.can_manage_examinations(school_id));
create policy "exam staff can manage examination cycles" on public.examination_cycles for all to authenticated using (app_private.can_manage_examinations(school_id)) with check (app_private.can_manage_examinations(school_id));
create policy "exam staff can read candidates" on public.examination_candidates for select to authenticated using (app_private.can_manage_examinations(school_id));
create policy "exam staff can manage candidates" on public.examination_candidates for all to authenticated using (app_private.can_manage_examinations(school_id)) with check (app_private.can_manage_examinations(school_id));
create policy "exam staff can read subject registrations" on public.examination_subject_registrations for select to authenticated using (app_private.can_manage_examinations(school_id));
create policy "exam staff can manage subject registrations" on public.examination_subject_registrations for all to authenticated using (app_private.can_manage_examinations(school_id)) with check (app_private.can_manage_examinations(school_id));
create policy "exam staff can read readiness issues" on public.examination_readiness_issues for select to authenticated using (app_private.can_manage_examinations(school_id));
create policy "exam staff can manage readiness issues" on public.examination_readiness_issues for all to authenticated using (app_private.can_manage_examinations(school_id)) with check (app_private.can_manage_examinations(school_id));

create or replace function public.refresh_examination_readiness(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.examination_cycles where id = p_cycle_id;
  if not found then raise exception 'Examination cycle not found'; end if;
  if not app_private.can_manage_examinations(v_cycle.school_id) then raise exception 'Permission denied'; end if;

  delete from public.examination_readiness_issues where examination_cycle_id = v_cycle.id and resolved = false;

  insert into public.examination_readiness_issues (tenant_id, school_id, examination_cycle_id, candidate_id, issue_code, severity, message)
  select ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id, 'identity_incomplete', 'blocking', 'Candidate identity has not been verified.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id and ec.identity_verified = false;

  insert into public.examination_readiness_issues (tenant_id, school_id, examination_cycle_id, candidate_id, issue_code, severity, message)
  select ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id, 'no_subjects', 'blocking', 'Candidate has no examination subjects registered.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and not exists (select 1 from public.examination_subject_registrations esr where esr.candidate_id = ec.id and esr.registration_status <> 'withdrawn');

  insert into public.examination_readiness_issues (tenant_id, school_id, examination_cycle_id, candidate_id, subject_registration_id, issue_code, severity, message)
  select esr.tenant_id, esr.school_id, ec.examination_cycle_id, ec.id, esr.id, 'subject_code_missing_mapping', 'warning', 'Examination subject is not linked to a configured school subject offering.'
  from public.examination_subject_registrations esr
  join public.examination_candidates ec on ec.id = esr.candidate_id
  where ec.examination_cycle_id = v_cycle.id and esr.subject_offering_id is null and esr.registration_status <> 'withdrawn';

  select count(*) into v_count from public.examination_readiness_issues where examination_cycle_id = v_cycle.id and resolved = false;
  return v_count;
end;
$$;

revoke all on function public.refresh_examination_readiness(uuid) from public, anon;
grant execute on function public.refresh_examination_readiness(uuid) to authenticated;

comment on table public.examination_candidates is 'School examination candidate registration linked to authoritative learner identity and enrolment; candidate numbers are cycle-scoped.';
comment on table public.examination_subject_registrations is 'Examination subject registrations preserve official subject codes while optionally mapping to operational school subject offerings.';
comment on table public.examination_readiness_issues is 'Regenerable validation exceptions used to make DNEA readiness an exception-driven workflow rather than a manual recount.';