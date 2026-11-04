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
  date_of_birth date,
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
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;

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
    l.first_names,l.surname,e.admission_number,l.sex,l.date_of_birth,
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
'Versioned school/year Sports/Houses learner roster including canonical DOB under the existing identity scope. Age and configured age groups use only the governed school reference date; future DOBs remain unresolved.';
