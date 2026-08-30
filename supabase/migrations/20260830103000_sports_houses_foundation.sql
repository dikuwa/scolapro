-- Configurable Sports & Houses foundation.
-- House names, colours, age bands and continuity rules are school data, never platform constants.
-- Client mutation is RPC-only; authenticated users receive SELECT access through RLS.

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

create or replace function app_private.can_manage_sports(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']);
$$;

revoke all on function app_private.can_manage_sports(uuid) from public,anon,authenticated;

create or replace function app_private.enforce_sports_school_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school_tenant uuid;
  v_house_tenant uuid;
  v_house_school uuid;
  v_person_tenant uuid;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null or new.tenant_id<>v_school_tenant then
    raise exception 'Sports record tenant must match school tenant';
  end if;

  if tg_table_name in ('sports_learner_house_assignments','sports_staff_house_assignments') then
    select tenant_id,school_id into v_house_tenant,v_house_school
    from public.sports_houses where id=new.house_id;
    if v_house_tenant is null or v_house_tenant<>new.tenant_id or v_house_school<>new.school_id then
      raise exception 'Sports house must belong to the same tenant and school';
    end if;
  end if;

  if tg_table_name='sports_learner_house_assignments' then
    select tenant_id into v_person_tenant from public.learners where id=new.learner_id;
    if v_person_tenant is null or v_person_tenant<>new.tenant_id then
      raise exception 'Learner must belong to the same tenant';
    end if;
    if not exists(
      select 1 from public.enrolments e
      where e.tenant_id=new.tenant_id and e.school_id=new.school_id and e.learner_id=new.learner_id
        and e.academic_year=new.academic_year and e.status in ('current','completed','transferred')
    ) then
      raise exception 'Learner must have an enrolment at the school for the sports year';
    end if;
  elsif tg_table_name='sports_staff_house_assignments' then
    select tenant_id into v_person_tenant from public.staff_members where id=new.staff_member_id;
    if v_person_tenant is null or v_person_tenant<>new.tenant_id then
      raise exception 'Staff member must belong to the same tenant';
    end if;
    if not exists(
      select 1 from public.staff_school_assignments ssa
      where ssa.tenant_id=new.tenant_id and ssa.school_id=new.school_id and ssa.staff_member_id=new.staff_member_id
        and ssa.effective_from<=make_date(new.academic_year,12,31)
        and (ssa.effective_to is null or ssa.effective_to>=make_date(new.academic_year,1,1))
    ) then
      raise exception 'Staff member must have a school placement overlapping the sports year';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_sports_school_scope() from public,anon,authenticated;

create or replace function app_private.enforce_sports_age_group_nonoverlap()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if new.status='active' and exists(
    select 1 from public.sports_age_groups g
    where g.school_id=new.school_id and g.id<>new.id and g.status='active'
      and coalesce(g.min_age,3)<=coalesce(new.max_age,30)
      and coalesce(new.min_age,3)<=coalesce(g.max_age,30)
  ) then
    raise exception 'Active sports age groups may not overlap';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_sports_age_group_nonoverlap() from public,anon,authenticated;

create trigger sports_houses_scope_trg before insert or update on public.sports_houses
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_year_settings_scope_trg before insert or update on public.sports_year_settings
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_age_groups_scope_trg before insert or update on public.sports_age_groups
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_age_groups_nonoverlap_trg before insert or update on public.sports_age_groups
for each row execute function app_private.enforce_sports_age_group_nonoverlap();
create trigger sports_learner_house_scope_trg before insert or update on public.sports_learner_house_assignments
for each row execute function app_private.enforce_sports_school_scope();
create trigger sports_staff_house_scope_trg before insert or update on public.sports_staff_house_assignments
for each row execute function app_private.enforce_sports_school_scope();

alter table public.sports_houses enable row level security;
alter table public.sports_year_settings enable row level security;
alter table public.sports_age_groups enable row level security;
alter table public.sports_learner_house_assignments enable row level security;
alter table public.sports_staff_house_assignments enable row level security;

create policy "school members read sports houses" on public.sports_houses
for select to authenticated using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school members read sports year settings" on public.sports_year_settings
for select to authenticated using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school members read sports age groups" on public.sports_age_groups
for select to authenticated using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school members read learner house assignments" on public.sports_learner_house_assignments
for select to authenticated using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));
create policy "school members read staff house assignments" on public.sports_staff_house_assignments
for select to authenticated using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin']));

revoke all on public.sports_houses,public.sports_year_settings,public.sports_age_groups,
  public.sports_learner_house_assignments,public.sports_staff_house_assignments from anon,authenticated;
grant select on public.sports_houses,public.sports_year_settings,public.sports_age_groups,
  public.sports_learner_house_assignments,public.sports_staff_house_assignments to authenticated;
grant select,insert,update,delete on public.sports_houses,public.sports_year_settings,public.sports_age_groups,
  public.sports_learner_house_assignments,public.sports_staff_house_assignments to service_role;

create or replace function public.upsert_sports_house(
  p_school_id uuid,p_name text,p_short_code text default null,p_color_hex text default null,
  p_sort_order integer default 0,p_house_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare v_tenant uuid; v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School not found or inactive'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'House name is required'; end if;
  if p_color_hex is not null and p_color_hex !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'House colour must be a six-digit hex value'; end if;
  if p_house_id is null then
    insert into public.sports_houses(tenant_id,school_id,name,short_code,color_hex,sort_order,created_by_user_id)
    values(v_tenant,p_school_id,btrim(p_name),nullif(upper(btrim(coalesce(p_short_code,''))),''),p_color_hex,coalesce(p_sort_order,0),auth.uid()) returning id into v_id;
  else
    update public.sports_houses set name=btrim(p_name),short_code=nullif(upper(btrim(coalesce(p_short_code,''))),''),
      color_hex=p_color_hex,sort_order=coalesce(p_sort_order,0),updated_at=now()
    where id=p_house_id and school_id=p_school_id returning id into v_id;
    if v_id is null then raise exception 'House not found in this school'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.set_sports_year_settings(
  p_school_id uuid,p_academic_year integer,p_age_reference_date date,p_assignment_continuity text default 'carry_forward',
  p_balance_by_sex boolean default true,p_balance_by_age_group boolean default true,p_balance_by_grade boolean default false
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare v_tenant uuid; v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School not found or inactive'; end if;
  insert into public.sports_year_settings(tenant_id,school_id,academic_year,age_reference_date,assignment_continuity,balance_by_sex,balance_by_age_group,balance_by_grade,created_by_user_id)
  values(v_tenant,p_school_id,p_academic_year,p_age_reference_date,p_assignment_continuity,coalesce(p_balance_by_sex,true),coalesce(p_balance_by_age_group,true),coalesce(p_balance_by_grade,false),auth.uid())
  on conflict(school_id,academic_year) do update set age_reference_date=excluded.age_reference_date,
    assignment_continuity=excluded.assignment_continuity,balance_by_sex=excluded.balance_by_sex,
    balance_by_age_group=excluded.balance_by_age_group,balance_by_grade=excluded.balance_by_grade,updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.upsert_sports_age_group(
  p_school_id uuid,p_label text,p_min_age smallint default null,p_max_age smallint default null,
  p_sort_order integer default 0,p_group_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare v_tenant uuid; v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School not found or inactive'; end if;
  if btrim(coalesce(p_label,''))='' then raise exception 'Age group label is required'; end if;
  if p_group_id is null then
    insert into public.sports_age_groups(tenant_id,school_id,label,min_age,max_age,sort_order,created_by_user_id)
    values(v_tenant,p_school_id,btrim(p_label),p_min_age,p_max_age,coalesce(p_sort_order,0),auth.uid()) returning id into v_id;
  else
    update public.sports_age_groups set label=btrim(p_label),min_age=p_min_age,max_age=p_max_age,
      sort_order=coalesce(p_sort_order,0),updated_at=now()
    where id=p_group_id and school_id=p_school_id returning id into v_id;
    if v_id is null then raise exception 'Age group not found in this school'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.assign_learner_sports_house(
  p_school_id uuid,p_academic_year integer,p_learner_id uuid,p_house_id uuid,
  p_assignment_source text default 'manual',p_is_locked boolean default false
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare v_tenant uuid; v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;
  insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id)
  values(v_tenant,p_school_id,p_academic_year,p_learner_id,p_house_id,p_assignment_source,coalesce(p_is_locked,false),auth.uid())
  on conflict(school_id,academic_year,learner_id) do update set house_id=excluded.house_id,
    assignment_source=excluded.assignment_source,is_locked=excluded.is_locked,assigned_by_user_id=auth.uid(),assigned_at=now(),updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.assign_staff_sports_house(
  p_school_id uuid,p_academic_year integer,p_staff_member_id uuid,p_house_id uuid,
  p_role_key text default 'member',p_assignment_source text default 'manual',p_is_locked boolean default false
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare v_tenant uuid; v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;
  insert into public.sports_staff_house_assignments(tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_by_user_id)
  values(v_tenant,p_school_id,p_academic_year,p_staff_member_id,p_house_id,p_role_key,p_assignment_source,coalesce(p_is_locked,false),auth.uid())
  on conflict(school_id,academic_year,staff_member_id) do update set house_id=excluded.house_id,role_key=excluded.role_key,
    assignment_source=excluded.assignment_source,is_locked=excluded.is_locked,assigned_by_user_id=auth.uid(),assigned_at=now(),updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.upsert_sports_house(uuid,text,text,text,integer,uuid) from public,anon;
revoke all on function public.set_sports_year_settings(uuid,integer,date,text,boolean,boolean,boolean) from public,anon;
revoke all on function public.upsert_sports_age_group(uuid,text,smallint,smallint,integer,uuid) from public,anon;
revoke all on function public.assign_learner_sports_house(uuid,integer,uuid,uuid,text,boolean) from public,anon;
revoke all on function public.assign_staff_sports_house(uuid,integer,uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.upsert_sports_house(uuid,text,text,text,integer,uuid) to authenticated;
grant execute on function public.set_sports_year_settings(uuid,integer,date,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.upsert_sports_age_group(uuid,text,smallint,smallint,integer,uuid) to authenticated;
grant execute on function public.assign_learner_sports_house(uuid,integer,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.assign_staff_sports_house(uuid,integer,uuid,uuid,text,text,boolean) to authenticated;

create or replace view public.sports_house_learner_roster with (security_invoker=true) as
select a.tenant_id,a.school_id,a.academic_year,a.house_id,h.name as house_name,h.color_hex as house_color_hex,
  a.learner_id,l.first_names,l.surname,l.sex,l.date_of_birth,
  case when ys.age_reference_date is not null and l.date_of_birth is not null
    then extract(year from age(ys.age_reference_date,l.date_of_birth))::integer end as age_on_reference_date,
  ag.id as age_group_id,ag.label as age_group_label,e.grade_id,e.register_class_id,a.assignment_source,a.is_locked,a.assigned_at
from public.sports_learner_house_assignments a
join public.sports_houses h on h.id=a.house_id and h.tenant_id=a.tenant_id and h.school_id=a.school_id
join public.learners l on l.id=a.learner_id and l.tenant_id=a.tenant_id
left join public.sports_year_settings ys on ys.tenant_id=a.tenant_id and ys.school_id=a.school_id and ys.academic_year=a.academic_year
left join public.enrolments e on e.tenant_id=a.tenant_id and e.school_id=a.school_id and e.learner_id=a.learner_id and e.academic_year=a.academic_year
left join lateral(
  select g.id,g.label from public.sports_age_groups g
  where g.tenant_id=a.tenant_id and g.school_id=a.school_id and g.status='active'
    and ys.age_reference_date is not null and l.date_of_birth is not null
    and (g.min_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer>=g.min_age)
    and (g.max_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer<=g.max_age)
  order by g.sort_order,g.label limit 1
) ag on true;

grant select on public.sports_house_learner_roster to authenticated;
revoke insert,update,delete on public.sports_house_learner_roster from authenticated;

comment on table public.sports_houses is 'School-configurable inter-house teams. Authenticated client mutation is RPC-only.';
comment on table public.sports_year_settings is 'School/year sports allocation settings with explicit age reference date and continuity policy.';
comment on table public.sports_age_groups is 'Non-overlapping school-defined active sports age bands.';
comment on table public.sports_learner_house_assignments is 'Historical year-scoped learner house membership with governed assignment provenance.';
comment on table public.sports_staff_house_assignments is 'Historical year-scoped staff house membership and one leader per house/year.';
