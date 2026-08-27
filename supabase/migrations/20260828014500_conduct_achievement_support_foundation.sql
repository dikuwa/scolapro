create table if not exists public.conduct_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  occurred_on date not null,
  direction text not null check (direction in ('positive','negative')),
  category_code text not null,
  severity text not null default 'routine' check (severity in ('routine','moderate','serious','critical')),
  summary text not null,
  details text,
  status text not null default 'recorded' check (status in ('recorded','under_review','resolved','void')),
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (resolved_at is null or resolved_at >= recorded_at)
);

create table if not exists public.achievement_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  achieved_on date not null,
  category_code text not null,
  title text not null,
  description text,
  level text check (level in ('class','school','circuit','regional','national','international','other')),
  evidence_path text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_support_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  opened_on date not null default current_date,
  case_type text not null,
  sensitivity text not null default 'restricted' check (sensitivity in ('restricted','highly_restricted')),
  summary text not null,
  status text not null default 'open' check (status in ('open','monitoring','referred','closed','cancelled')),
  owner_staff_member_id uuid references public.staff_members(id) on delete set null,
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_on is null or closed_on >= opened_on)
);

create table if not exists public.learner_support_interventions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  support_case_id uuid not null references public.learner_support_cases(id) on delete cascade,
  intervention_date date not null,
  intervention_type text not null,
  note text not null,
  next_review_on date,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (next_review_on is null or next_review_on >= intervention_date)
);

create index if not exists conduct_events_learner_date_idx on public.conduct_events (school_id, learner_id, occurred_on desc);
create index if not exists achievement_events_learner_date_idx on public.achievement_events (school_id, learner_id, achieved_on desc);
create index if not exists learner_support_cases_school_status_idx on public.learner_support_cases (school_id, status, opened_on desc);
create index if not exists learner_support_interventions_case_date_idx on public.learner_support_interventions (support_case_id, intervention_date desc);

alter table public.conduct_events enable row level security;
alter table public.achievement_events enable row level security;
alter table public.learner_support_cases enable row level security;
alter table public.learner_support_interventions enable row level security;

create or replace function app_private.can_manage_learner_support(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal','counsellor','learner_support']);
$$;

grant execute on function app_private.can_manage_learner_support(uuid) to authenticated;

create policy "authorized staff can read conduct events"
on public.conduct_events for select to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "teaching staff can create conduct events"
on public.conduct_events for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor'])
);

create policy "leaders can update conduct events"
on public.conduct_events for update to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "authorized staff can read achievements"
on public.achievement_events for select to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "teaching staff can create achievements"
on public.achievement_events for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher'])
);

create policy "leaders can update achievements"
on public.achievement_events for update to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "restricted staff can read learner support cases"
on public.learner_support_cases for select to authenticated
using (app_private.can_manage_learner_support(school_id));

create policy "restricted staff can manage learner support cases"
on public.learner_support_cases for all to authenticated
using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id) and opened_by_user_id is not null);

create policy "restricted staff can read support interventions"
on public.learner_support_interventions for select to authenticated
using (app_private.can_manage_learner_support(school_id));

create policy "restricted staff can manage support interventions"
on public.learner_support_interventions for all to authenticated
using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id) and recorded_by_user_id = auth.uid());

comment on table public.conduct_events is 'Longitudinal positive and negative conduct events. Serious events remain governed records rather than a simplistic points balance.';
comment on table public.achievement_events is 'Positive learner achievements captured independently from disciplinary conduct.';
comment on table public.learner_support_cases is 'Restricted learner-support casework with deliberately narrower permissions than ordinary learner profiles.';
comment on table public.learner_support_interventions is 'Append-oriented interventions and review notes attached to a restricted learner-support case.';