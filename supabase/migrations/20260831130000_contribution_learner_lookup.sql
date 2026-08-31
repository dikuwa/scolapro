-- Keep contribution entry usable for large schools without sending the full learner
-- roster to the browser. Eligibility remains role-aware: school leadership can search
-- the current school roster; class teachers can search only their assigned register
-- classes.

create or replace function public.search_contribution_eligible_learners(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default null,
  p_limit integer default 20
)
returns table(
  learner_id uuid,
  learner_name text,
  admission_number text,
  grade_name text,
  class_name text
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_key text;
  v_staff_member_id uuid;
  v_query text := nullif(btrim(coalesce(p_query,'')), '');
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select sm.role_key,
         coalesce(sm.staff_member_id, staff.id)
    into v_role_key, v_staff_member_id
  from public.school_memberships sm
  left join public.staff_members staff
    on staff.user_id=v_user_id
   and staff.tenant_id=sm.tenant_id
  where sm.school_id=p_school_id
    and sm.user_id=v_user_id
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
  order by case sm.role_key
    when 'school_admin' then 1
    when 'principal' then 2
    when 'deputy_principal' then 3
    when 'class_teacher' then 4
    else 99 end
  limit 1;

  if v_role_key is null or v_role_key not in ('school_admin','principal','deputy_principal','class_teacher') then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    trim(concat(l.first_names,' ',l.surname)),
    e.admission_number,
    coalesce(g.display_name,'Unassigned'),
    coalesce(rc.display_name,'Unassigned')
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.grades g on g.id=e.grade_id
  left join public.register_classes rc on rc.id=e.register_class_id
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current'
    and e.enrolled_from<=current_date
    and (e.enrolled_to is null or e.enrolled_to>=current_date)
    and (
      v_role_key<>'class_teacher'
      or (
        v_staff_member_id is not null
        and rc.register_teacher_staff_id=v_staff_member_id
      )
    )
    and (
      v_query is null
      or concat_ws(' ',l.first_names,l.surname,l.preferred_name,e.admission_number,g.display_name,rc.display_name)
        ilike '%' || v_query || '%'
    )
  order by lower(l.surname),lower(l.first_names),e.id
  limit v_limit;
end;
$$;

revoke all on function public.search_contribution_eligible_learners(uuid,integer,text,integer) from public,anon;
grant execute on function public.search_contribution_eligible_learners(uuid,integer,text,integer) to authenticated;

comment on function public.search_contribution_eligible_learners(uuid,integer,text,integer) is
'Bounded server-side learner search for voluntary contribution entry. School leadership sees the current school roster; class teachers are restricted to register classes assigned to their staff identity.';