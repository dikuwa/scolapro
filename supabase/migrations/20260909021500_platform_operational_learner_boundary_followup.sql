-- Follow-up to 20260909020000. The earlier migration was already pushed and
-- exercised by CI, so preserve its identity and close the remaining helper fallback
-- with a uniquely later migration.
--
-- app_private.has_school_role() intentionally treats platform_admin as a broad
-- administrative override for non-sensitive school administration. That helper is
-- therefore not a valid permission boundary for learner-operational reads.

create or replace function app_private.can_access_learner_observations_school_scoped(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = (select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','social_worker')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id = e.register_class_id
      left join public.staff_members register_staff on register_staff.id = rc.register_teacher_staff_id
      where e.school_id = p_school_id
        and e.learner_id = p_learner_id
        and e.status = 'current'
        and e.enrolled_from <= current_date
        and (e.enrolled_to is null or e.enrolled_to >= current_date)
        and (
          (
            register_staff.user_id = (select auth.uid())
            and register_staff.status = 'active'
            and exists(
              select 1
              from public.school_memberships sm
              where sm.school_id = p_school_id
                and sm.user_id = (select auth.uid())
                and sm.role_key = 'class_teacher'
                and sm.active_from <= current_date
                and (sm.active_to is null or sm.active_to >= current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id = ta.staff_member_id
            where ta.school_id = p_school_id
              and ta.register_class_id = e.register_class_id
              and ta.academic_year = e.academic_year
              and ta.active_from <= current_date
              and (ta.active_to is null or ta.active_to >= current_date)
              and teacher_staff.user_id = (select auth.uid())
              and teacher_staff.status = 'active'
              and app_private.staff_member_has_school_assignment(teacher_staff.id,p_school_id,current_date)
          )
        )
    );
$$;

revoke all on function app_private.can_access_learner_observations_school_scoped(uuid,uuid)
from public, anon, authenticated;

create or replace function public.search_operational_learner_directory(
  p_school_id uuid,
  p_query text default null,
  p_limit integer default 30
)
returns table(
  learner_id uuid,
  enrolment_id uuid,
  display_name text,
  admission_number text,
  academic_year integer,
  grade_name text,
  class_name text
)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  -- Deliberately do not use has_school_role() here: platform_admin is a valid
  -- administrative override in that generic helper, but not learner-operational authority.
  if not exists(
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = (select auth.uid())
      and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','hod','teacher','class_teacher','librarian')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    e.id,
    btrim(l.first_names||' '||l.surname),
    e.admission_number,
    e.academic_year,
    g.display_name,
    rc.display_name
  from public.enrolments e
  join public.learners l on l.id = e.learner_id
  left join public.grades g on g.id = e.grade_id
  left join public.register_classes rc on rc.id = e.register_class_id
  where e.school_id = p_school_id
    and e.status = 'current'
    and e.enrolled_from <= current_date
    and (e.enrolled_to is null or e.enrolled_to >= current_date)
    and (
      exists(
        select 1
        from public.school_memberships sm
        where sm.school_id = p_school_id
          and sm.user_id = (select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','hod','librarian')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
      )
      or app_private.can_access_learner_observations_school_scoped(p_school_id,l.id)
    )
    and (
      v_query = ''
      or lower(l.first_names||' '||l.surname) like '%'||v_query||'%'
      or lower(coalesce(e.admission_number,'')) like '%'||v_query||'%'
      or lower(coalesce(g.display_name,'')) like '%'||v_query||'%'
      or lower(coalesce(rc.display_name,'')) like '%'||v_query||'%'
    )
  order by l.surname,l.first_names
  limit v_limit;
end;
$$;

revoke all on function public.search_operational_learner_directory(uuid,text,integer)
from public, anon;
grant execute on function public.search_operational_learner_directory(uuid,text,integer)
to authenticated;

comment on function public.search_operational_learner_directory(uuid,text,integer) is
'Operational learner selector requiring an effective school-scoped operational role. Generic platform administration authority is not sufficient and does not broaden teacher/class-teacher learner scope.';
