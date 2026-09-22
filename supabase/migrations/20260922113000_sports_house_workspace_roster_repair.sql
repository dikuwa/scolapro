-- Repair: production drift left the governed Sports / Houses learner roster RPC unapplied.
-- Re-declare the repository contract so /school/sports-houses can load safely.

create or replace function public.get_sports_house_learner_roster(
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
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if app_private.has_platform_role(array['platform_support']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.has_platform_role(array['platform_admin'])
     and not app_private.has_school_role(
       p_school_id,
       array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
     ) then
    raise exception 'Permission denied';
  end if;

  if not exists (select 1 from public.schools s where s.id=p_school_id) then
    raise exception 'School not found';
  end if;

  return query
  with eligible_enrolments as (
    select distinct on (e.learner_id)
      e.tenant_id,
      e.school_id,
      e.academic_year,
      e.learner_id,
      e.admission_number
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status in ('current','completed','transferred')
    order by e.learner_id,
      case e.status when 'current' then 1 when 'completed' then 2 when 'transferred' then 3 else 4 end,
      e.id
  )
  select
    e.tenant_id,
    e.school_id,
    e.academic_year,
    e.learner_id,
    l.first_names,
    l.surname,
    e.admission_number,
    a.house_id,
    h.name as house_name,
    h.color_hex as house_color_hex,
    a.assignment_source,
    coalesce(a.is_locked,false) as is_locked,
    a.assigned_at,
    case when ys.age_reference_date is not null and l.date_of_birth is not null
      then extract(year from age(ys.age_reference_date,l.date_of_birth))::integer end as age_on_reference_date,
    ag.label as age_group_label
  from eligible_enrolments e
  join public.learners l
    on l.id=e.learner_id and l.tenant_id=e.tenant_id
  left join public.sports_learner_house_assignments a
    on a.tenant_id=e.tenant_id
   and a.school_id=e.school_id
   and a.academic_year=e.academic_year
   and a.learner_id=e.learner_id
  left join public.sports_houses h
    on h.id=a.house_id
   and h.tenant_id=a.tenant_id
   and h.school_id=a.school_id
  left join public.sports_year_settings ys
    on ys.tenant_id=e.tenant_id
   and ys.school_id=e.school_id
   and ys.academic_year=e.academic_year
  left join lateral (
    select g.label
    from public.sports_age_groups g
    where g.tenant_id=e.tenant_id
      and g.school_id=e.school_id
      and g.status='active'
      and ys.age_reference_date is not null
      and l.date_of_birth is not null
      and (g.min_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer>=g.min_age)
      and (g.max_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer<=g.max_age)
    order by g.sort_order,g.label
    limit 1
  ) ag on true
  order by l.first_names,l.surname,e.learner_id;
end;
$$;

revoke all on function public.get_sports_house_learner_roster(uuid,integer) from public,anon;
grant execute on function public.get_sports_house_learner_roster(uuid,integer) to authenticated;

comment on function public.get_sports_house_learner_roster(uuid,integer) is
'Governed current-school Sports / Houses learner roster read for one academic year; includes eligible enrolments, admission numbers, assignment continuity and age-group labels without exposing an unrestricted learner directory.';
