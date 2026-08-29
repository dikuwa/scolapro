-- Namibian Cumulative Record Card (CRC) foundation.
-- The paper CRC is a longitudinal record assembled from several domains. Existing
-- ScolaPro sources remain authoritative for identity/guardians, enrolments, report
-- cards, conduct and learner-support casework. These tables capture the material
-- CRC sections that do not yet have a durable structured home.

create table if not exists public.learner_prior_school_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  admission_number text,
  school_name text not null,
  medium_of_instruction text,
  admission_date date,
  admission_grade text,
  departure_date date,
  departure_grade text,
  exemption_from_compulsory_education boolean,
  exemption_date date,
  age_on_initial_school_entry numeric(4,1),
  source text not null default 'historical_record' check (source in ('historical_record','transfer_record','school_entry','verified_import')),
  source_note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_date is null or admission_date is null or departure_date >= admission_date),
  check (exemption_date is null or exemption_from_compulsory_education is true)
);

create table if not exists public.learner_health_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  observed_on date not null,
  general_health text,
  problem_or_disability text,
  management_or_support text,
  previous_illnesses text,
  sensitivity text not null default 'restricted' check (sensitivity in ('restricted','highly_restricted')),
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    nullif(btrim(coalesce(general_health,'')),'') is not null
    or nullif(btrim(coalesce(problem_or_disability,'')),'') is not null
    or nullif(btrim(coalesce(management_or_support,'')),'') is not null
    or nullif(btrim(coalesce(previous_illnesses,'')),'') is not null
  )
);

create table if not exists public.learner_psychometric_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  test_date date not null,
  test_name text not null,
  grade_label text,
  tester_name text,
  tester_staff_member_id uuid references public.staff_members(id) on delete set null,
  remarks text,
  sensitivity text not null default 'highly_restricted' check (sensitivity in ('restricted','highly_restricted')),
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learner_development_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  grade_label text,
  domain text not null check (domain in ('psychological','social','overall_impression')),
  observation text not null,
  observed_on date,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(observation),'') is not null)
);

create table if not exists public.learner_cumulative_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  note_date date not null default current_date,
  note_type text not null check (note_type in ('general_remark','recommendation','interview','transfer_note')),
  note text not null,
  sensitivity text not null default 'restricted' check (sensitivity in ('routine','restricted','highly_restricted')),
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(note),'') is not null)
);

create index if not exists learner_prior_school_history_learner_idx on public.learner_prior_school_history (school_id,learner_id,coalesce(admission_date,departure_date) desc);
create index if not exists learner_health_history_learner_idx on public.learner_health_history (school_id,learner_id,observed_on desc);
create index if not exists learner_psychometric_records_learner_idx on public.learner_psychometric_records (school_id,learner_id,test_date desc);
create index if not exists learner_development_observations_learner_idx on public.learner_development_observations (school_id,learner_id,academic_year desc,domain);
create index if not exists learner_cumulative_notes_learner_idx on public.learner_cumulative_notes (school_id,learner_id,note_date desc);

alter table public.learner_prior_school_history enable row level security;
alter table public.learner_health_history enable row level security;
alter table public.learner_psychometric_records enable row level security;
alter table public.learner_development_observations enable row level security;
alter table public.learner_cumulative_notes enable row level security;

-- Reuse the existing learner/enrolment scope guard so no CRC row can be attached to
-- a learner outside the school/tenant relationship.
create trigger learner_prior_school_history_scope_guard before insert or update on public.learner_prior_school_history
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');
create trigger learner_health_history_scope_guard before insert or update on public.learner_health_history
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');
create trigger learner_psychometric_records_scope_guard before insert or update on public.learner_psychometric_records
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');
create trigger learner_development_observations_scope_guard before insert or update on public.learner_development_observations
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');
create trigger learner_cumulative_notes_scope_guard before insert or update on public.learner_cumulative_notes
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');

create policy "assigned staff read prior school history" on public.learner_prior_school_history
for select to authenticated using (app_private.can_access_learner_observations(school_id,learner_id));
create policy "enrolment leaders manage prior school history" on public.learner_prior_school_history
for all to authenticated using (app_private.can_manage_enrolment_workflow(school_id))
with check (app_private.can_manage_enrolment_workflow(school_id) and recorded_by_user_id=(select auth.uid()));

create policy "restricted staff read health history" on public.learner_health_history
for select to authenticated using (app_private.can_manage_learner_support(school_id));
create policy "restricted staff manage health history" on public.learner_health_history
for all to authenticated using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id) and recorded_by_user_id=(select auth.uid()));

create policy "restricted staff read psychometric records" on public.learner_psychometric_records
for select to authenticated using (app_private.can_manage_learner_support(school_id));
create policy "restricted staff manage psychometric records" on public.learner_psychometric_records
for all to authenticated using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id) and recorded_by_user_id=(select auth.uid()));

create policy "assigned staff read development observations" on public.learner_development_observations
for select to authenticated using (app_private.can_access_learner_observations(school_id,learner_id));
create policy "assigned staff create development observations" on public.learner_development_observations
for insert to authenticated with check (
  app_private.can_access_learner_observations(school_id,learner_id)
  and recorded_by_user_id=(select auth.uid())
);
create policy "leaders update development observations" on public.learner_development_observations
for update to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','counsellor']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','counsellor']));

create policy "authorized staff read cumulative notes" on public.learner_cumulative_notes
for select to authenticated using (
  case when sensitivity='routine'
    then app_private.can_access_learner_observations(school_id,learner_id)
    else app_private.can_manage_learner_support(school_id)
  end
);
create policy "authorized staff create cumulative notes" on public.learner_cumulative_notes
for insert to authenticated with check (
  recorded_by_user_id=(select auth.uid())
  and (
    (sensitivity='routine' and app_private.can_access_learner_observations(school_id,learner_id))
    or (sensitivity<>'routine' and app_private.can_manage_learner_support(school_id))
  )
);
create policy "restricted leaders update cumulative notes" on public.learner_cumulative_notes
for update to authenticated using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id));

comment on table public.learner_prior_school_history is 'Historical schools-attended section of the Namibian cumulative record, including legacy schools outside ScolaPro.';
comment on table public.learner_health_history is 'Restricted longitudinal physical-condition/general-health section of the Namibian cumulative record.';
comment on table public.learner_psychometric_records is 'Highly restricted psychometric-test ledger from the Namibian cumulative record; detailed test evidence belongs in governed support storage.';
comment on table public.learner_development_observations is 'Year/grade narrative observations for psychological, social and overall personality-development domains.';
comment on table public.learner_cumulative_notes is 'General remarks, recommendations, interviews and transfer notes that complete the longitudinal cumulative learner record.';
