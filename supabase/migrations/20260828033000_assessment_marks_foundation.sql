create table if not exists public.assessment_schemes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete cascade,
  scheme_key text not null,
  version text not null,
  capture_mode text not null check (capture_mode in ('detailed','final_result')),
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','active','superseded','archived')),
  configuration jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_offering_id, scheme_key, version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.assessment_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_scheme_id uuid not null references public.assessment_schemes(id) on delete cascade,
  component_code text not null,
  display_name text not null,
  component_type text not null check (component_type in ('task','test','practical','project','oral','exam_paper','exam_total','final_result','other')),
  raw_max numeric(10,2),
  weight numeric(8,4),
  contributes_to_report boolean not null default true,
  required boolean not null default true,
  sort_order integer not null default 100,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (assessment_scheme_id, component_code),
  check (raw_max is null or raw_max > 0),
  check (weight is null or weight >= 0)
);

create table if not exists public.assessment_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  assessment_scheme_id uuid not null references public.assessment_schemes(id) on delete restrict,
  assessment_component_id uuid references public.assessment_components(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  teacher_allocation_id uuid references public.teacher_allocations(id) on delete restrict,
  term_number smallint check (term_number between 1 and 6),
  display_name text not null,
  assessment_date date,
  raw_max numeric(10,2),
  status text not null default 'not_open' check (status in ('not_open','open','submitted','review','returned','verified','locked','cancelled')),
  opened_at timestamptz,
  locked_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (raw_max is null or raw_max > 0)
);

create table if not exists public.learner_marks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_instance_id uuid not null references public.assessment_instances(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  numeric_mark numeric(10,2),
  mark_status text check (mark_status in ('absent','exempt','incomplete','withheld')),
  teacher_note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  client_mutation_id uuid,
  replaces_mark_id uuid references public.learner_marks(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((numeric_mark is not null)::integer + (mark_status is not null)::integer <= 1)
);

create unique index if not exists learner_marks_client_mutation_uidx on public.learner_marks(school_id, client_mutation_id) where client_mutation_id is not null;
create index if not exists learner_marks_instance_enrolment_idx on public.learner_marks(assessment_instance_id, enrolment_id, recorded_at desc);

create table if not exists public.mark_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_instance_id uuid not null references public.assessment_instances(id) on delete restrict,
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  completeness jsonb not null default '{}'::jsonb,
  calculation_version text,
  status text not null default 'submitted' check (status in ('submitted','returned','verified','locked')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.official_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  term_number smallint check (term_number between 1 and 6),
  result_value numeric(10,2),
  result_status text check (result_status in ('absent','exempt','incomplete','withheld')),
  symbol text,
  assessment_scheme_key text not null,
  assessment_scheme_version text not null,
  academic_rule_set_key text,
  academic_rule_set_version text,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  approved_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  locked_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (enrolment_id, subject_offering_id, term_number),
  check ((result_value is not null)::integer + (result_status is not null)::integer <= 1)
);

create index if not exists assessment_instances_class_status_idx on public.assessment_instances(school_id, register_class_id, status);
create index if not exists mark_submissions_instance_idx on public.mark_submissions(assessment_instance_id, submitted_at desc);
create index if not exists official_results_learner_year_idx on public.official_results(school_id, learner_id, academic_year, term_number);

alter table public.assessment_schemes enable row level security;
alter table public.assessment_components enable row level security;
alter table public.assessment_instances enable row level security;
alter table public.learner_marks enable row level security;
alter table public.mark_submissions enable row level security;
alter table public.official_results enable row level security;

create or replace function app_private.can_access_assessment_instance(target_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessment_instances ai
    where ai.id = target_instance_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(ai.school_id, array['school_admin','principal','deputy_principal','hod'])
        or exists (
          select 1 from public.school_memberships sm
          where sm.school_id = ai.school_id and sm.user_id = auth.uid() and sm.staff_member_id is not null
            and sm.role_key in ('teacher','class_teacher') and sm.active_from <= current_date and (sm.active_to is null or sm.active_to >= current_date)
            and exists (
              select 1 from public.teacher_allocations ta
              where ta.id = ai.teacher_allocation_id and ta.staff_member_id = sm.staff_member_id
                and ta.active_from <= current_date and (ta.active_to is null or ta.active_to >= current_date)
            )
        )
      )
  );
$$;

grant execute on function app_private.can_access_assessment_instance(uuid) to authenticated;

create policy "academic staff can read assessment schemes" on public.assessment_schemes for select to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "academic leaders can manage assessment schemes" on public.assessment_schemes for all to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));
create policy "academic staff can read assessment components" on public.assessment_components for select to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "academic leaders can manage assessment components" on public.assessment_components for all to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));
create policy "scoped academic staff can read assessment instances" on public.assessment_instances for select to authenticated using (app_private.can_access_assessment_instance(id));
create policy "academic staff can manage accessible assessment instances" on public.assessment_instances for all to authenticated using (app_private.can_access_assessment_instance(id)) with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "scoped academic staff can read learner marks" on public.learner_marks for select to authenticated using (app_private.can_access_assessment_instance(assessment_instance_id));
create policy "scoped academic staff can append learner marks" on public.learner_marks for insert to authenticated with check (recorded_by_user_id = auth.uid() and app_private.can_access_assessment_instance(assessment_instance_id));
create policy "scoped academic staff can read mark submissions" on public.mark_submissions for select to authenticated using (app_private.can_access_assessment_instance(assessment_instance_id));
create policy "scoped academic staff can create mark submissions" on public.mark_submissions for insert to authenticated with check (submitted_by_user_id = auth.uid() and app_private.can_access_assessment_instance(assessment_instance_id));
create policy "academic leaders can update mark submissions" on public.mark_submissions for update to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));
create policy "academic staff can read official results" on public.official_results for select to authenticated using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "academic leaders can create official results" on public.official_results for insert to authenticated with check (approved_by_user_id = auth.uid() and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create or replace view public.learner_marks_current with (security_invoker = true) as
select distinct on (lm.assessment_instance_id, lm.enrolment_id) lm.*
from public.learner_marks lm
order by lm.assessment_instance_id, lm.enrolment_id, lm.recorded_at desc, lm.created_at desc;

grant select on public.learner_marks_current to authenticated;

comment on table public.learner_marks is 'Append-only working mark revisions. Numeric marks and statuses such as absent/exempt are mutually exclusive.';
comment on view public.learner_marks_current is 'Latest effective working mark per assessment instance and enrolment under caller RLS.';
comment on table public.official_results is 'Approved immutable result snapshot carrying assessment and academic-rule version provenance for report cards, promotion and longitudinal history.';