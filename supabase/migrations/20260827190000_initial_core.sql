create extension if not exists pgcrypto;

create schema if not exists app_private;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  emis_number text,
  region text,
  town text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  status text not null default 'active' check (status in ('active','inactive','left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_number)
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  role_key text not null,
  active_from date not null default current_date,
  active_to date,
  created_at timestamptz not null default now(),
  unique (school_id, user_id, role_key, active_from),
  check (active_to is null or active_to >= active_from)
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null,
  grade_code text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, academic_year, grade_code)
);

create table if not exists public.register_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  academic_year integer not null,
  class_code text not null,
  display_name text not null,
  register_teacher_staff_id uuid references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, academic_year, class_code)
);

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  national_id text,
  birth_certificate_number text,
  first_names text not null,
  surname text not null,
  preferred_name text,
  date_of_birth date,
  sex text check (sex in ('female','male','other','unspecified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learners_tenant_name_idx
  on public.learners (tenant_id, surname, first_names);

create table if not exists public.enrolments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  academic_year integer not null,
  grade_id uuid references public.grades(id) on delete restrict,
  register_class_id uuid references public.register_classes(id) on delete restrict,
  admission_number text,
  enrolled_from date not null,
  enrolled_to date,
  status text not null default 'current' check (status in ('current','transferred','left','completed','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, learner_id, academic_year),
  check (enrolled_to is null or enrolled_to >= enrolled_from)
);

create index if not exists enrolments_school_year_idx
  on public.enrolments (school_id, academic_year, status);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function app_private.has_school_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

create or replace function app_private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.tenant_id = target_tenant_id
      and sm.user_id = auth.uid()
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.has_school_access(uuid) to authenticated;
grant execute on function app_private.has_tenant_access(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.schools enable row level security;
alter table public.user_profiles enable row level security;
alter table public.staff_members enable row level security;
alter table public.school_memberships enable row level security;
alter table public.grades enable row level security;
alter table public.register_classes enable row level security;
alter table public.learners enable row level security;
alter table public.enrolments enable row level security;
alter table public.audit_events enable row level security;

create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using (user_id = auth.uid());

create policy "users can update own profile"
on public.user_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "members can read accessible tenants"
on public.tenants for select
to authenticated
using (app_private.has_tenant_access(id));

create policy "members can read accessible schools"
on public.schools for select
to authenticated
using (app_private.has_school_access(id));

create policy "members can read own memberships"
on public.school_memberships for select
to authenticated
using (user_id = auth.uid() or app_private.has_school_access(school_id));

create policy "members can read school staff"
on public.staff_members for select
to authenticated
using (app_private.has_tenant_access(tenant_id));

create policy "members can read school grades"
on public.grades for select
to authenticated
using (app_private.has_school_access(school_id));

create policy "members can read school classes"
on public.register_classes for select
to authenticated
using (app_private.has_school_access(school_id));

create policy "members can read enrolled learners"
on public.learners for select
to authenticated
using (
  exists (
    select 1
    from public.enrolments e
    where e.learner_id = learners.id
      and app_private.has_school_access(e.school_id)
  )
);

create policy "members can read school enrolments"
on public.enrolments for select
to authenticated
using (app_private.has_school_access(school_id));

create policy "members can read school audit events"
on public.audit_events for select
to authenticated
using (school_id is not null and app_private.has_school_access(school_id));

comment on schema app_private is 'Security helper functions; not an application data API.';
comment on table public.learners is 'Long-lived learner identity. School membership belongs in enrolments, not this table.';
comment on table public.enrolments is 'Effective-dated learner relationship to a school and academic year.';
