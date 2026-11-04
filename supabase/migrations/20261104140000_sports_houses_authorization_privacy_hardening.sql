-- Issue #1257 security remediation.
-- Keep raw learner DOB out of the default Sports roster and require canonical
-- learner-identity authorization for the explicit server-side export path.

create or replace function app_private.is_active_school_admin(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $is_active_school_admin$
  select auth.uid() is not null
    and not app_private.has_platform_role(array['platform_admin','platform_support'])
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=auth.uid()
        and sm.role_key='school_admin'
        and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
        and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    );
$is_active_school_admin$;

revoke all on function app_private.is_active_school_admin(uuid) from public,anon,authenticated;

create or replace function public.set_sports_year_reference_date(
  p_school_id uuid,
  p_academic_year integer,
  p_age_reference_date date,
  p_school_approval_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $set_sports_year_reference_date$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.is_active_school_admin(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year is null or p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_age_reference_date is null
     or extract(year from p_age_reference_date)::integer <> p_academic_year then
    raise exception 'Age reference date must be within the selected academic year';
  end if;
  if p_school_approval_confirmed is not true then
    raise exception 'Confirm school approval before saving the reference date';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  insert into public.sports_year_settings(
    tenant_id,
    school_id,
    academic_year,
    age_reference_date,
    created_by_user_id
  )
  values(
    v_tenant_id,
    p_school_id,
    p_academic_year,
    p_age_reference_date,
    auth.uid()
  )
  on conflict(school_id,academic_year) do update
    set age_reference_date=excluded.age_reference_date,
        updated_at=now()
  returning id into v_id;

  return v_id;
end;
$set_sports_year_reference_date$;

revoke all on function public.set_sports_year_reference_date(uuid,integer,date,boolean) from public,anon;
grant execute on function public.set_sports_year_reference_date(uuid,integer,date,boolean) to authenticated;

comment on function public.set_sports_year_reference_date(uuid,integer,date,boolean) is
'Explicit, school-approved Sports age reference-date setup. Only an active School Admin membership in the target school may write the canonical date; changes are audited and age groups are untouched.';

-- Preserve existing sports-manager access to continuity/balancing settings,
-- but the legacy RPC can no longer create or change the canonical date. A
-- changed date must go through the confirmed, School-Admin-only RPC above.
create or replace function public.set_sports_year_settings(
  p_school_id uuid,
  p_academic_year integer,
  p_age_reference_date date,
  p_assignment_continuity text default 'carry_forward',
  p_balance_by_sex boolean default true,
  p_balance_by_age_group boolean default true,
  p_balance_by_grade boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $set_sports_year_settings$
declare
  v_id uuid;
  v_existing_reference_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year is null or p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Academic year is invalid';
  end if;
  if not exists (
    select 1 from public.schools s where s.id=p_school_id and s.status='active'
  ) then
    raise exception 'School not found or inactive';
  end if;

  select sys.id,sys.age_reference_date
    into v_id,v_existing_reference_date
  from public.sports_year_settings sys
  where sys.school_id=p_school_id and sys.academic_year=p_academic_year
  for update;
  if not found then
    raise exception 'Configure the school-approved reference date through the explicit School Admin flow before saving other year settings';
  end if;
  if v_existing_reference_date is distinct from p_age_reference_date then
    raise exception 'Use the confirmed School Admin reference-date flow to change the age reference date';
  end if;

  update public.sports_year_settings
  set assignment_continuity=p_assignment_continuity,
      balance_by_sex=coalesce(p_balance_by_sex,true),
      balance_by_age_group=coalesce(p_balance_by_age_group,true),
      balance_by_grade=coalesce(p_balance_by_grade,false),
      updated_at=now()
  where id=v_id;

  return v_id;
end;
$set_sports_year_settings$;

revoke all on function public.set_sports_year_settings(uuid,integer,date,text,boolean,boolean,boolean) from public,anon;
grant execute on function public.set_sports_year_settings(uuid,integer,date,text,boolean,boolean,boolean) to authenticated;

-- PostgreSQL cannot change a TABLE-returning function's result type with
-- CREATE OR REPLACE. No database objects depend on this client RPC; dropping
-- without CASCADE deliberately fails closed if a dependent object is added.
drop function public.get_sports_house_operational_learner_roster_v2(uuid,integer);

create function public.get_sports_house_operational_learner_roster_v2(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  tenant_id uuid,
  school_id uuid,
  academic_year integer,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  sex text,
  grade_id uuid,
  grade_name text,
  register_class_id uuid,
  register_class_name text,
  house_id uuid,
  house_name text,
  house_color_hex text,
  assignment_source text,
  is_locked boolean,
  assigned_at timestamptz,
  age_on_reference_date integer,
  age_group_label text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $sports_operational_roster_v2$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if not app_private.has_platform_role(array['platform_admin'])
     and not app_private.has_school_role(
       p_school_id,
       array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
     ) then
    raise exception 'Permission denied';
  end if;
  if p_academic_year is null or p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;

  return query
  with eligible_enrolments as (
    select distinct on (e.learner_id)
      e.tenant_id,e.school_id,e.academic_year,e.learner_id,e.admission_number,
      e.grade_id,e.register_class_id
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status in ('current','completed','transferred')
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_local_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or app_private.can_read_learner_identity(p_school_id,e.learner_id)
      )
    order by e.learner_id,
      case e.status when 'current' then 1 when 'completed' then 2 when 'transferred' then 3 else 4 end,
      e.enrolled_from desc,e.id
  )
  select
    e.tenant_id,e.school_id,e.academic_year,e.learner_id,
    l.first_names,l.surname,e.admission_number,l.sex,
    e.grade_id,g.display_name,
    e.register_class_id,rc.display_name,
    a.house_id,h.name,h.color_hex,a.assignment_source,
    coalesce(a.is_locked,false),a.assigned_at,
    case
      when ys.age_reference_date is not null
       and l.date_of_birth is not null
       and l.date_of_birth <= ys.age_reference_date
        then extract(year from age(ys.age_reference_date,l.date_of_birth))::integer
      else null
    end,
    ag.label
  from eligible_enrolments e
  join public.learners l on l.id=e.learner_id and l.tenant_id=e.tenant_id
  left join public.grades g on g.id=e.grade_id and g.school_id=e.school_id and g.academic_year=e.academic_year
  left join public.register_classes rc on rc.id=e.register_class_id and rc.school_id=e.school_id and rc.academic_year=e.academic_year
  left join public.sports_learner_house_assignments a
    on a.tenant_id=e.tenant_id and a.school_id=e.school_id
   and a.academic_year=e.academic_year and a.learner_id=e.learner_id
  left join public.sports_houses h
    on h.id=a.house_id and h.tenant_id=a.tenant_id and h.school_id=a.school_id
  left join public.sports_year_settings ys
    on ys.tenant_id=e.tenant_id and ys.school_id=e.school_id and ys.academic_year=e.academic_year
  left join lateral (
    select sag.label
    from public.sports_age_groups sag
    where sag.tenant_id=e.tenant_id and sag.school_id=e.school_id and sag.status='active'
      and ys.age_reference_date is not null
      and l.date_of_birth is not null
      and l.date_of_birth <= ys.age_reference_date
      and (sag.min_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer>=sag.min_age)
      and (sag.max_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer<=sag.max_age)
    order by sag.sort_order,sag.label,sag.id
    limit 1
  ) ag on true
  order by g.display_name nulls last,rc.display_name nulls last,l.surname,l.first_names,e.learner_id;
end;
$sports_operational_roster_v2$;

revoke all on function public.get_sports_house_operational_learner_roster_v2(uuid,integer) from public,anon;
grant execute on function public.get_sports_house_operational_learner_roster_v2(uuid,integer) to authenticated;

comment on function public.get_sports_house_operational_learner_roster_v2(uuid,integer) is
'Versioned school/year Sports/Houses learner roster. Raw DOB is deliberately excluded; age and age groups use only the governed school reference date, with future DOBs unresolved.';

create function public.get_sports_house_roster_dob_export(
  p_school_id uuid,
  p_academic_year integer,
  p_house_ids uuid[],
  p_include_date_of_birth boolean
)
returns table(
  learner_id uuid,
  date_of_birth date
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $sports_house_roster_dob_export$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if not app_private.has_platform_role(array['platform_admin'])
     and not app_private.has_school_role(
       p_school_id,
       array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
     ) then
    raise exception 'Permission denied';
  end if;
  if p_academic_year is null or p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_include_date_of_birth is not true then
    raise exception 'DOB export must be explicitly selected';
  end if;
  if p_house_ids is null or cardinality(p_house_ids)=0 then
    raise exception 'At least one school house must be selected for DOB export';
  end if;
  if exists (
    select 1
    from unnest(p_house_ids) selected(house_id)
    where not exists (
      select 1
      from public.sports_houses h
      where h.id=selected.house_id and h.school_id=p_school_id
    )
  ) then
    raise exception 'Sports house must belong to the requested school';
  end if;

  return query
  with eligible_enrolments as (
    select distinct on (e.learner_id)
      e.tenant_id,e.school_id,e.academic_year,e.learner_id
    from public.enrolments e
    join public.sports_learner_house_assignments a
      on a.tenant_id=e.tenant_id
     and a.school_id=e.school_id
     and a.academic_year=e.academic_year
     and a.learner_id=e.learner_id
     and a.house_id=any(p_house_ids)
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status in ('current','completed','transferred')
    order by e.learner_id,
      case e.status when 'current' then 1 when 'completed' then 2 when 'transferred' then 3 else 4 end,
      e.enrolled_from desc,e.id
  )
  select e.learner_id,l.date_of_birth
  from eligible_enrolments e
  join public.learners l on l.id=e.learner_id and l.tenant_id=e.tenant_id
  where app_private.can_read_learner_identity(p_school_id,e.learner_id);
end;
$sports_house_roster_dob_export$;

revoke all on function public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean) from public,anon;
grant execute on function public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean) to authenticated;

comment on function public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean) is
'Explicit, school/year/house-scoped Sports roster DOB export. Returns DOB only when requested and the canonical per-learner identity gate permits it; historical roster membership alone grants no DOB access.';

-- Keep the legacy view's non-DOB contract while retiring its direct raw-DOB path.
revoke all on public.sports_house_learner_roster from public,anon,authenticated;
grant select(
  tenant_id,school_id,academic_year,house_id,house_name,house_color_hex,learner_id,
  first_names,surname,sex,age_on_reference_date,age_group_id,age_group_label,
  grade_id,register_class_id,assignment_source,is_locked,assigned_at
) on public.sports_house_learner_roster to authenticated;
