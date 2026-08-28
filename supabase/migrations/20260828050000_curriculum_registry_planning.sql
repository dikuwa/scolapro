create table if not exists public.curriculum_sources (
  id uuid primary key default gen_random_uuid(),
  authority text not null default 'NIED',
  source_key text not null,
  title text not null,
  source_url text,
  source_document_date date,
  checksum text,
  provenance jsonb not null default '{}'::jsonb,
  status text not null default 'discovered' check (status in ('discovered','imported','verified','superseded','withdrawn')),
  created_at timestamptz not null default now(),
  unique (authority, source_key)
);

create table if not exists public.curriculum_subjects (
  id uuid primary key default gen_random_uuid(),
  curriculum_key text not null,
  display_name text not null,
  phase_code text,
  subject_code text,
  authority text not null default 'NIED',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (authority, curriculum_key)
);

create table if not exists public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  curriculum_subject_id uuid not null references public.curriculum_subjects(id) on delete restrict,
  version_key text not null,
  source_id uuid references public.curriculum_sources(id) on delete restrict,
  effective_from_year integer not null check (effective_from_year between 1900 and 2200),
  effective_to_year integer check (effective_to_year between 1900 and 2200),
  status text not null default 'imported' check (status in ('imported','structured','under_review','approved','published','superseded','withdrawn')),
  metadata jsonb not null default '{}'::jsonb,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_subject_id, version_key),
  check (effective_to_year is null or effective_to_year >= effective_from_year)
);

create table if not exists public.curriculum_units (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  unit_code text not null,
  theme text,
  topic text not null,
  sequence_number integer not null default 100,
  recommended_periods_min smallint,
  recommended_periods_max smallint,
  practical_required boolean not null default false,
  assessment_guidance text,
  prerequisites jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (curriculum_version_id, unit_code),
  check (recommended_periods_min is null or recommended_periods_min >= 0),
  check (recommended_periods_max is null or recommended_periods_max >= coalesce(recommended_periods_min,0))
);

create table if not exists public.curriculum_objectives (
  id uuid primary key default gen_random_uuid(),
  curriculum_unit_id uuid not null references public.curriculum_units(id) on delete cascade,
  objective_code text,
  objective_text text not null,
  sequence_number integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_competencies (
  id uuid primary key default gen_random_uuid(),
  curriculum_unit_id uuid not null references public.curriculum_units(id) on delete cascade,
  competency_code text,
  competency_text text not null,
  sequence_number integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_practicals (
  id uuid primary key default gen_random_uuid(),
  curriculum_unit_id uuid not null references public.curriculum_units(id) on delete cascade,
  practical_code text,
  title text not null,
  description text,
  recommended_periods smallint check (recommended_periods is null or recommended_periods > 0),
  resources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.subject_offerings add column if not exists curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict;
create index if not exists subject_offerings_curriculum_version_idx on public.subject_offerings(curriculum_version_id) where curriculum_version_id is not null;
create index if not exists curriculum_versions_subject_idx on public.curriculum_versions(curriculum_subject_id, effective_from_year desc);
create index if not exists curriculum_units_version_sequence_idx on public.curriculum_units(curriculum_version_id, sequence_number);
create index if not exists curriculum_objectives_unit_idx on public.curriculum_objectives(curriculum_unit_id, sequence_number);
create index if not exists curriculum_competencies_unit_idx on public.curriculum_competencies(curriculum_unit_id, sequence_number);

alter table public.curriculum_sources enable row level security;
alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.curriculum_units enable row level security;
alter table public.curriculum_objectives enable row level security;
alter table public.curriculum_competencies enable row level security;
alter table public.curriculum_practicals enable row level security;

create policy "authenticated users can read curriculum sources" on public.curriculum_sources for select to authenticated using (status <> 'withdrawn');
create policy "authenticated users can read curriculum subjects" on public.curriculum_subjects for select to authenticated using (active = true);
create policy "authenticated users can read published curriculum versions" on public.curriculum_versions for select to authenticated using (status in ('approved','published','superseded'));
create policy "authenticated users can read curriculum units" on public.curriculum_units for select to authenticated using (exists (select 1 from public.curriculum_versions cv where cv.id=curriculum_units.curriculum_version_id and cv.status in ('approved','published','superseded')));
create policy "authenticated users can read curriculum objectives" on public.curriculum_objectives for select to authenticated using (exists (select 1 from public.curriculum_units cu join public.curriculum_versions cv on cv.id=cu.curriculum_version_id where cu.id=curriculum_objectives.curriculum_unit_id and cv.status in ('approved','published','superseded')));
create policy "authenticated users can read curriculum competencies" on public.curriculum_competencies for select to authenticated using (exists (select 1 from public.curriculum_units cu join public.curriculum_versions cv on cv.id=cu.curriculum_version_id where cu.id=curriculum_competencies.curriculum_unit_id and cv.status in ('approved','published','superseded')));
create policy "authenticated users can read curriculum practicals" on public.curriculum_practicals for select to authenticated using (exists (select 1 from public.curriculum_units cu join public.curriculum_versions cv on cv.id=cu.curriculum_version_id where cu.id=curriculum_practicals.curriculum_unit_id and cv.status in ('approved','published','superseded')));

create policy "platform admins can manage curriculum sources" on public.curriculum_sources for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum subjects" on public.curriculum_subjects for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum versions" on public.curriculum_versions for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum units" on public.curriculum_units for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum objectives" on public.curriculum_objectives for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum competencies" on public.curriculum_competencies for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));
create policy "platform admins can manage curriculum practicals" on public.curriculum_practicals for all to authenticated using (app_private.has_platform_role(array['platform_admin'])) with check (app_private.has_platform_role(array['platform_admin']));

create table if not exists public.school_curriculum_overlays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_offering_id uuid not null references public.subject_offerings(id) on delete cascade,
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft','active','archived')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_offering_id, curriculum_version_id, academic_year)
);

create table if not exists public.pacing_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  plan_level text not null check (plan_level in ('national_baseline','department','class')),
  register_class_id uuid references public.register_classes(id) on delete restrict,
  teacher_allocation_id uuid references public.teacher_allocations(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','active','superseded','archived')),
  capacity_summary jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((plan_level='class' and register_class_id is not null) or (plan_level<>'class'))
);

create table if not exists public.pacing_plan_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  pacing_plan_id uuid not null references public.pacing_plans(id) on delete cascade,
  curriculum_unit_id uuid not null references public.curriculum_units(id) on delete restrict,
  planned_start_on date,
  planned_end_on date,
  planned_periods smallint not null check (planned_periods > 0),
  priority text not null default 'normal' check (priority in ('essential','high','normal','extension')),
  sequence_number integer not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  check (planned_end_on is null or planned_start_on is null or planned_end_on >= planned_start_on)
);

create table if not exists public.teaching_schedule_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  pacing_plan_item_id uuid not null references public.pacing_plan_items(id) on delete cascade,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  teacher_allocation_id uuid not null references public.teacher_allocations(id) on delete restrict,
  planned_on date not null,
  planned_period_count smallint not null default 1 check (planned_period_count > 0),
  status text not null default 'planned' check (status in ('planned','prepared','taught','moved','cancelled')),
  moved_to_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_preparations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  teaching_schedule_item_id uuid not null references public.teaching_schedule_items(id) on delete cascade,
  planned_on date not null,
  curriculum_snapshot jsonb not null default '{}'::jsonb,
  preparation jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','prepared','submitted','reviewed','returned','archived')),
  prepared_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teaching_schedule_item_id)
);

create table if not exists public.teaching_actuals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  teaching_schedule_item_id uuid not null references public.teaching_schedule_items(id) on delete restrict,
  taught_on date not null,
  periods_used smallint not null default 1 check (periods_used > 0),
  coverage_state text not null check (coverage_state in ('not_started','started','partially_taught','taught','reinforcement_needed','assessed')),
  reflection text,
  compensatory_action text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create index if not exists school_curriculum_overlays_offering_idx on public.school_curriculum_overlays(subject_offering_id, academic_year);
create index if not exists pacing_plans_offering_idx on public.pacing_plans(subject_offering_id, academic_year, status);
create index if not exists pacing_plan_items_plan_idx on public.pacing_plan_items(pacing_plan_id, sequence_number);
create index if not exists teaching_schedule_class_date_idx on public.teaching_schedule_items(register_class_id, planned_on);
create index if not exists teaching_schedule_teacher_date_idx on public.teaching_schedule_items(teacher_allocation_id, planned_on);
create index if not exists teaching_actuals_schedule_idx on public.teaching_actuals(teaching_schedule_item_id, taught_on);

alter table public.school_curriculum_overlays enable row level security;
alter table public.pacing_plans enable row level security;
alter table public.pacing_plan_items enable row level security;
alter table public.teaching_schedule_items enable row level security;
alter table public.lesson_preparations enable row level security;
alter table public.teaching_actuals enable row level security;

create or replace function app_private.can_access_teaching_plan(target_school_id uuid, target_teacher_allocation_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id,array['school_admin','principal','deputy_principal','hod'])
    or exists (
      select 1 from public.teacher_allocations ta
      join public.school_memberships sm on sm.school_id=ta.school_id and sm.staff_member_id=ta.staff_member_id
      where ta.id=target_teacher_allocation_id and ta.school_id=target_school_id and sm.user_id=auth.uid()
        and sm.role_key in ('teacher','class_teacher') and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
        and ta.active_from<=current_date and (ta.active_to is null or ta.active_to>=current_date)
    );
$$;
grant execute on function app_private.can_access_teaching_plan(uuid,uuid) to authenticated;

create policy "academic staff can read school curriculum overlays" on public.school_curriculum_overlays for select to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "academic leaders can manage school curriculum overlays" on public.school_curriculum_overlays for all to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod']));
create policy "scoped academic staff can read pacing plans" on public.pacing_plans for select to authenticated using (app_private.can_access_teaching_plan(school_id,teacher_allocation_id));
create policy "academic leaders can manage pacing plans" on public.pacing_plans for all to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod']));
create policy "scoped academic staff can read pacing items" on public.pacing_plan_items for select to authenticated using (exists (select 1 from public.pacing_plans pp where pp.id=pacing_plan_items.pacing_plan_id and app_private.can_access_teaching_plan(pp.school_id,pp.teacher_allocation_id)));
create policy "academic leaders can manage pacing items" on public.pacing_plan_items for all to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod']));
create policy "scoped staff can read teaching schedule" on public.teaching_schedule_items for select to authenticated using (app_private.can_access_teaching_plan(school_id,teacher_allocation_id));
create policy "scoped staff can manage teaching schedule" on public.teaching_schedule_items for all to authenticated using (app_private.can_access_teaching_plan(school_id,teacher_allocation_id)) with check (app_private.can_access_teaching_plan(school_id,teacher_allocation_id));
create policy "scoped staff can read lesson preparations" on public.lesson_preparations for select to authenticated using (exists (select 1 from public.teaching_schedule_items tsi where tsi.id=lesson_preparations.teaching_schedule_item_id and app_private.can_access_teaching_plan(tsi.school_id,tsi.teacher_allocation_id)));
create policy "preparing teacher can manage lesson preparations" on public.lesson_preparations for all to authenticated using (prepared_by_user_id=(select auth.uid()) or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])) with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod']) or prepared_by_user_id=(select auth.uid()));
create policy "scoped staff can read teaching actuals" on public.teaching_actuals for select to authenticated using (exists (select 1 from public.teaching_schedule_items tsi where tsi.id=teaching_actuals.teaching_schedule_item_id and app_private.can_access_teaching_plan(tsi.school_id,tsi.teacher_allocation_id)));
create policy "recording teacher can create teaching actuals" on public.teaching_actuals for insert to authenticated with check (recorded_by_user_id=(select auth.uid()) and exists (select 1 from public.teaching_schedule_items tsi where tsi.id=teaching_actuals.teaching_schedule_item_id and app_private.can_access_teaching_plan(tsi.school_id,tsi.teacher_allocation_id)));

-- Defense-in-depth scope guards for school-owned planning children.
drop trigger if exists overlays_offering_scope_guard on public.school_curriculum_overlays;
create trigger overlays_offering_scope_guard before insert or update on public.school_curriculum_overlays for each row execute function app_private.enforce_parent_scope('subject_offering_id','public.subject_offerings','school_id','required');
drop trigger if exists pacing_plan_offering_scope_guard on public.pacing_plans;
create trigger pacing_plan_offering_scope_guard before insert or update on public.pacing_plans for each row execute function app_private.enforce_parent_scope('subject_offering_id','public.subject_offerings','school_id','required');
drop trigger if exists pacing_items_plan_scope_guard on public.pacing_plan_items;
create trigger pacing_items_plan_scope_guard before insert or update on public.pacing_plan_items for each row execute function app_private.enforce_parent_scope('pacing_plan_id','public.pacing_plans','school_id','required');
drop trigger if exists teaching_schedule_pacing_scope_guard on public.teaching_schedule_items;
create trigger teaching_schedule_pacing_scope_guard before insert or update on public.teaching_schedule_items for each row execute function app_private.enforce_parent_scope('pacing_plan_item_id','public.pacing_plan_items','school_id','required');
drop trigger if exists teaching_schedule_class_scope_guard on public.teaching_schedule_items;
create trigger teaching_schedule_class_scope_guard before insert or update on public.teaching_schedule_items for each row execute function app_private.enforce_parent_scope('register_class_id','public.register_classes','school_id','required');
drop trigger if exists teaching_schedule_allocation_scope_guard on public.teaching_schedule_items;
create trigger teaching_schedule_allocation_scope_guard before insert or update on public.teaching_schedule_items for each row execute function app_private.enforce_parent_scope('teacher_allocation_id','public.teacher_allocations','school_id','required');
drop trigger if exists lesson_preparation_schedule_scope_guard on public.lesson_preparations;
create trigger lesson_preparation_schedule_scope_guard before insert or update on public.lesson_preparations for each row execute function app_private.enforce_parent_scope('teaching_schedule_item_id','public.teaching_schedule_items','school_id','required');
drop trigger if exists teaching_actual_schedule_scope_guard on public.teaching_actuals;
create trigger teaching_actual_schedule_scope_guard before insert or update on public.teaching_actuals for each row execute function app_private.enforce_parent_scope('teaching_schedule_item_id','public.teaching_schedule_items','school_id','required');

comment on table public.curriculum_versions is 'Versioned structured official curriculum content; publication requires governed verification rather than live scraping or autonomous AI publication.';
comment on table public.pacing_plans is 'National/department/class planning layer connecting curriculum to real school capacity without silently compressing curriculum.';
comment on table public.lesson_preparations is 'Teacher lesson-preparation draft preserving a curriculum snapshot separately from pedagogical preparation content.';
comment on table public.teaching_actuals is 'Actual teaching date/coverage/reflection record kept separate from the original planned date.';