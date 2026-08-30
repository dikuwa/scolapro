-- Configurable inter-house sports foundation.
-- House names, colours, age groups, and assignment policies are school data;
-- nothing in this model is specific to one school.

create table public.sports_houses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null,
  short_code text,
  color_hex text,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (short_code is null or btrim(short_code) <> ''),
  check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index sports_houses_school_name_uidx
  on public.sports_houses(school_id, lower(btrim(name)))
  where status <> 'archived';
create index sports_houses_school_status_idx
  on public.sports_houses(school_id, status, sort_order, name);

create table public.sports_year_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  age_reference_date date not null,
  assignment_continuity text not null default 'carry_forward'
    check (assignment_continuity in ('carry_forward','rebalance_each_year')),
  balance_by_sex boolean not null default true,
  balance_by_age_group boolean not null default true,
  balance_by_grade boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year),
  check (extract(year from age_reference_date)::integer = academic_year)
);

create table public.sports_age_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  label text not null,
  min_age smallint,
  max_age smallint,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(label) <> ''),
  check (min_age is null or min_age between 3 and 30),
  check (max_age is null or max_age between 3 and 30),
  check (min_age is null or max_age is null or min_age <= max_age)
);

create unique index sports_age_groups_school_label_uidx
  on public.sports_age_groups(school_id, lower(btrim(label)));
create index sports_age_groups_school_status_idx
  on public.sports_age_groups(school_id, status, sort_order);

create table public.sports_learner_house_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  learner_id uuid not null references public.learners(id) on delete restrict,
  house_id uuid not null references public.sports_houses(id) on delete restrict,
  assignment_source text not null default 'manual'
    check (assignment_source in ('automatic','manual','import','carry_forward')),
  is_locked boolean not null default false,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, learner_id)
);

create index sports_learner_house_year_house_idx
  on public.sports_learner_house_assignments(school_id, academic_year, house_id);
create index sports_learner_house_learner_idx
  on public.sports_learner_house_assignments(learner_id, academic_year desc);

create table public.sports_staff_house_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  house_id uuid not null references public.sports_houses(id) on delete restrict,
  role_key text not null default 'member' check (role_key in ('member','leader')),
  assignment_source text not null default 'manual'
    check (assignment_source in ('automatic','manual','import','carry_forward')),
  is_locked boolean not null default false,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, staff_member_id)
);

create unique index sports_staff_house_one_leader_uidx
  on public.sports_staff_house_assignments(school_id, academic_year, house_id)
  where role_key = 'leader';
create index sports_staff_house_year_house_idx
  on public.sports_staff_house_assignments(school_id, academic_year, house_id);

create or replace function app_private.enforce_sports_school_scope()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_school_tenant uuid;
  v_house_tenant uuid;
  v_house_school uuid;
  v_person_tenant uuid;
begin
  select tenant_id into v_school_tenant from public.schools where id = new.school_id;
  if v_school_tenant is null or new.tenant_id <> v_school_tenant then
    raise exception 'Sports record tenant must match school tenant';
  end if;

  if tg_table_name in ('sports_learner_house_assignments','sports_staff_house_assignments') then
    select tenant_id, school_id into v_house_tenant, v_house_school
    from public.sports_houses where id = new.house_id;
    if v_house_tenant is null or v_house_tenant <> new.tenant_id or v_house_school <> new.school_id then
      raise exception 'Sports house must belong to the same tenant and school';
    end if;
  end if;

  if tg_table_name = 'sports_learner_house_assignments' then
    select tenant_id into v_person_tenant from public.learners where id = new.learner_id;
    if v_person_tenant is null or v_person_tenant <> new.tenant_id then
      raise exception 'Learner must belong to the same tenant';
    end if;
    if not exists (
      select 1 from public.enrolments e
      where e.school_id = new.school_id
        and e.learner_id = new.learner_id
        and e.academic_year = new.academic_year
        and e.status in ('current','completed','transferred')
    ) then
      raise exception 'Learner must have an enrolment at the school for the sports year';
    end if;
  elsif tg_table_name = 'sports_staff_house_assignments' then
    select tenant_id into v_person_tenant from public.staff_members where id = new.staff_member_id;
    if v_person_tenant is null or v_person_tenant <> new.tenant_id then
      raise exception 'Staff member must belong to the same tenant';
    end if;
    if not exists (
      select 1 from public.staff_school_assignments ssa
      where ssa.school_id = new.school_id
        and ssa.staff_member_id = new.staff_member_id
        and ssa.effective_from <= make_date(new.academic_year,12,31)
        and (ssa.effective_to is null or ssa.effective_to >= make_date(new.academic_year,1,1))
    ) then
      raise exception 'Staff member must have a school placement overlapping the sports year';
    end if;
  end if;

  return new;
end;
$$;

create trigger sports_houses_scope_trg
before insert or update on public.sports_houses
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_year_settings_scope_trg
before insert or update on public.sports_year_settings
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_age_groups_scope_trg
before insert or update on public.sports_age_groups
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_learner_house_scope_trg
before insert or update on public.sports_learner_house_assignments
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_staff_house_scope_trg
before insert or update on public.sports_staff_house_assignments
for each row execute function app_private.enforce_sports_school_scope();

revoke all on function app_private.enforce_sports_school_scope() from public, anon, authenticated;

alter table public.sports_houses enable row level security;
alter table public.sports_year_settings enable row level security;
alter table public.sports_age_groups enable row level security;
alter table public.sports_learner_house_assignments enable row level security;
alter table public.sports_staff_house_assignments enable row level security;

create policy "school members read sports houses"
on public.sports_houses for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school leaders manage sports houses"
on public.sports_houses for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']));

create policy "school members read sports year settings"
on public.sports_year_settings for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school leaders manage sports year settings"
on public.sports_year_settings for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']));

create policy "school members read sports age groups"
on public.sports_age_groups for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school leaders manage sports age groups"
on public.sports_age_groups for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']));

create policy "school members read learner house assignments"
on public.sports_learner_house_assignments for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school leaders manage learner house assignments"
on public.sports_learner_house_assignments for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']));

create policy "school members read staff house assignments"
on public.sports_staff_house_assignments for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school leaders manage staff house assignments"
on public.sports_staff_house_assignments for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']) or app_private.has_platform_role(array['platform_admin']));

revoke all on public.sports_houses from anon;
revoke all on public.sports_year_settings from anon;
revoke all on public.sports_age_groups from anon;
revoke all on public.sports_learner_house_assignments from anon;
revoke all on public.sports_staff_house_assignments from anon;
grant select,insert,update,delete on public.sports_houses to authenticated;
grant select,insert,update,delete on public.sports_year_settings to authenticated;
grant select,insert,update,delete on public.sports_age_groups to authenticated;
grant select,insert,update,delete on public.sports_learner_house_assignments to authenticated;
grant select,insert,update,delete on public.sports_staff_house_assignments to authenticated;

create or replace view public.sports_house_learner_roster
with (security_invoker = true)
as
select
  a.tenant_id,
  a.school_id,
  a.academic_year,
  a.house_id,
  h.name as house_name,
  h.color_hex as house_color_hex,
  a.learner_id,
  l.first_names,
  l.surname,
  l.sex,
  l.date_of_birth,
  case when ys.age_reference_date is not null and l.date_of_birth is not null
    then extract(year from age(ys.age_reference_date,l.date_of_birth))::integer
    else null end as age_on_reference_date,
  ag.id as age_group_id,
  ag.label as age_group_label,
  e.grade_id,
  e.register_class_id,
  a.assignment_source,
  a.is_locked,
  a.assigned_at
from public.sports_learner_house_assignments a
join public.sports_houses h on h.id = a.house_id
join public.learners l on l.id = a.learner_id
left join public.sports_year_settings ys
  on ys.school_id = a.school_id and ys.academic_year = a.academic_year
left join public.enrolments e
  on e.school_id = a.school_id and e.learner_id = a.learner_id and e.academic_year = a.academic_year
left join lateral (
  select g.id, g.label
  from public.sports_age_groups g
  where g.school_id = a.school_id
    and g.status = 'active'
    and ys.age_reference_date is not null
    and l.date_of_birth is not null
    and (g.min_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer >= g.min_age)
    and (g.max_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer <= g.max_age)
  order by g.sort_order, g.label
  limit 1
) ag on true;

grant select on public.sports_house_learner_roster to authenticated;

comment on table public.sports_houses is 'School-configurable inter-house teams; names and colours are never platform constants.';
comment on table public.sports_year_settings is 'School/year sports allocation settings, including the explicit age reference date and continuity policy.';
comment on table public.sports_age_groups is 'School-defined sports age bands such as U14, U15, Junior, Senior, or Open.';
comment on table public.sports_learner_house_assignments is 'Historical year-scoped learner house membership with automatic/manual/import/carry-forward provenance.';
comment on table public.sports_staff_house_assignments is 'Historical year-scoped staff house membership and house leadership.';
