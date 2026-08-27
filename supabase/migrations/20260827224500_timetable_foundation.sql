create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  subject_code text not null,
  display_name text not null,
  curriculum_subject_key text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, subject_code)
);

create table if not exists public.subject_offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  periods_per_cycle smallint not null default 1 check (periods_per_cycle between 1 and 30),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, subject_id, grade_id)
);

create table if not exists public.teacher_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  active_from date not null default current_date,
  active_to date,
  created_at timestamptz not null default now(),
  unique (subject_offering_id, register_class_id, staff_member_id, active_from),
  check (active_to is null or active_to >= active_from)
);

create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  period_number smallint not null check (period_number between 1 and 30),
  display_name text not null,
  starts_at time,
  ends_at time,
  is_teaching_period boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, academic_year, period_number),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  cycle_code text not null default 'A',
  weekday smallint not null check (weekday between 1 and 7),
  period_id uuid not null references public.timetable_periods(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  teacher_allocation_id uuid not null references public.teacher_allocations(id) on delete restrict,
  room_label text,
  status text not null default 'active' check (status in ('active','cancelled','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, cycle_code, weekday, period_id, register_class_id)
);

create unique index if not exists timetable_slots_teacher_conflict_uidx
on public.timetable_slots (school_id, academic_year, cycle_code, weekday, period_id, teacher_allocation_id)
where status = 'active';

create index if not exists teacher_allocations_school_year_idx
on public.teacher_allocations (school_id, academic_year, staff_member_id);

alter table public.subjects enable row level security;
alter table public.subject_offerings enable row level security;
alter table public.teacher_allocations enable row level security;
alter table public.timetable_periods enable row level security;
alter table public.timetable_slots enable row level security;

create policy "members can read school subjects" on public.subjects for select to authenticated using (app_private.has_school_access(school_id));
create policy "members can read subject offerings" on public.subject_offerings for select to authenticated using (app_private.has_school_access(school_id));
create policy "members can read teacher allocations" on public.teacher_allocations for select to authenticated using (app_private.has_school_access(school_id));
create policy "members can read timetable periods" on public.timetable_periods for select to authenticated using (app_private.has_school_access(school_id));
create policy "members can read timetable slots" on public.timetable_slots for select to authenticated using (app_private.has_school_access(school_id));

create policy "school admins can manage subjects" on public.subjects for all to authenticated using (app_private.can_manage_school_members(school_id)) with check (app_private.can_manage_school_members(school_id));
create policy "school admins can manage subject offerings" on public.subject_offerings for all to authenticated using (app_private.can_manage_school_members(school_id)) with check (app_private.can_manage_school_members(school_id));
create policy "school admins can manage teacher allocations" on public.teacher_allocations for all to authenticated using (app_private.can_manage_school_members(school_id)) with check (app_private.can_manage_school_members(school_id));
create policy "school admins can manage timetable periods" on public.timetable_periods for all to authenticated using (app_private.can_manage_school_members(school_id)) with check (app_private.can_manage_school_members(school_id));
create policy "school admins can manage timetable slots" on public.timetable_slots for all to authenticated using (app_private.can_manage_school_members(school_id)) with check (app_private.can_manage_school_members(school_id));

comment on table public.subject_offerings is 'School/year/grade operational offering of a subject; may later map to an official curriculum subject version.';
comment on table public.teacher_allocations is 'Canonical teacher-to-subject-to-class allocation reused by timetable, marks, planning, workload and statutory reporting.';
comment on table public.timetable_slots is 'Published operational timetable slot. Unique constraints prevent class and teacher double-booking for the same cycle/day/period.';
