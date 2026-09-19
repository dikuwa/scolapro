-- Issue #502 / Stream B: absence review live-QA hardening.
--
-- Keep daily/register and subject-period attendance separate. This only closes
-- two authorization gaps found during source QA: Platform Support must never
-- acquire school-operational scope through a secondary school membership, and
-- class-teacher daily scope must end when governed staff placement ends.
create or replace function public.resolve_absence_review_scope(
  p_school_id uuid,
  p_from date,
  p_to date
)
returns table(scope_kind text, scope_id uuid, register_class_id uuid)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_today date := (timezone('Africa/Windhoek', now()))::date;
  v_current_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_school_id is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid absence review scope';
  end if;

  if exists (
    select 1
    from public.platform_memberships pm
    where pm.user_id = auth.uid()
      and pm.role_key = 'platform_support'
      and pm.active_from <= v_today
      and (pm.active_to is null or pm.active_to >= v_today)
  ) then
    return;
  end if;

  select sm.school_id
  into v_current_school_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= v_today
    and (sm.active_to is null or sm.active_to >= v_today)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_current_school_id is null or p_school_id <> v_current_school_id then
    return;
  end if;

  if exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
      and (
        sm.staff_member_id is null
        or app_private.staff_member_covers_school_period(
          sm.staff_member_id, p_school_id, v_today, v_today
        )
      )
  ) then
    return query
      select 'daily_class'::text, rc.id, rc.id
      from public.register_classes rc
      where rc.school_id = p_school_id;

    return query
      select 'subject_slot'::text, ts.id, ts.register_class_id
      from public.timetable_slots ts
      join public.teacher_allocations ta on ta.id = ts.teacher_allocation_id
      where ts.school_id = p_school_id
        and ts.status = 'active'
        and ta.school_id = p_school_id
        and ta.active_from <= p_to
        and (ta.active_to is null or ta.active_to >= p_from);
    return;
  end if;

  return query
    select 'daily_class'::text, rc.id, rc.id
    from public.school_memberships sm
    join public.staff_members staff on staff.id = sm.staff_member_id
    join public.register_classes rc
      on rc.school_id = sm.school_id
     and rc.register_teacher_staff_id = staff.id
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key = 'class_teacher'
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
      and staff.user_id = auth.uid()
      and staff.status = 'active'
      and app_private.staff_member_covers_school_period(
        staff.id, p_school_id, v_today, v_today
      );

  return query
    select distinct 'subject_slot'::text, ts.id, ts.register_class_id
    from public.school_memberships sm
    join public.staff_members staff on staff.id = sm.staff_member_id
    join public.teacher_allocations ta
      on ta.school_id = sm.school_id
     and ta.staff_member_id = staff.id
     and ta.active_from <= p_to
     and (ta.active_to is null or ta.active_to >= p_from)
    join public.timetable_slots ts
      on ts.school_id = sm.school_id
     and ts.teacher_allocation_id = ta.id
     and ts.status = 'active'
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key in ('teacher','class_teacher','hod')
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
      and staff.user_id = auth.uid()
      and staff.status = 'active'
      and app_private.staff_member_covers_school_period(
        staff.id, p_school_id, v_today, v_today
      );
end;
$$;

revoke all on function public.resolve_absence_review_scope(uuid,date,date) from public, anon;
grant execute on function public.resolve_absence_review_scope(uuid,date,date) to authenticated;

comment on function public.resolve_absence_review_scope(uuid,date,date) is
'Returns current-school-only daily-class and subject-slot visibility for absence review. Platform Support is excluded. Leadership is school-wide inside the current school; class-teacher daily scope requires assigned register class plus current governed staff placement; teacher/class-teacher/HOD subject scope follows explicit allocations plus current placement. Guardian review/evidence authority remains separate.';


-- Guardian absence notices can contain medical evidence. Keep the existing
-- reviewer role model, but apply the same current-school/effective-placement
-- precedence used by the Absence Reviews route. This does not grant any new
-- reviewer role.
create or replace function app_private.can_review_guardian_absence_notice(p_notice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select not app_private.has_platform_role(array['platform_support'])
    and exists(
      select 1
      from public.guardian_absence_notices n
      join public.enrolments e on e.id = n.enrolment_id
      where n.id = p_notice_id
        and (
          app_private.has_platform_role(array['platform_admin'])
          or (
            app_private.user_current_school_matches((select auth.uid()), n.school_id)
            and (
              exists(
                select 1
                from public.school_memberships sm
                where sm.school_id = n.school_id
                  and sm.user_id = (select auth.uid())
                  and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
                  and sm.active_from <= current_date
                  and (sm.active_to is null or sm.active_to >= current_date)
                  and (
                    sm.staff_member_id is null
                    or app_private.staff_member_covers_school_period(
                      sm.staff_member_id, n.school_id, current_date, current_date
                    )
                  )
              )
              or exists(
                select 1
                from public.register_classes rc
                join public.staff_members staff
                  on staff.id = rc.register_teacher_staff_id
                 and staff.user_id = (select auth.uid())
                 and staff.status = 'active'
                join public.school_memberships sm
                  on sm.school_id = rc.school_id
                 and sm.staff_member_id = staff.id
                 and sm.user_id = (select auth.uid())
                 and sm.role_key = 'class_teacher'
                 and sm.active_from <= current_date
                 and (sm.active_to is null or sm.active_to >= current_date)
                where rc.id = e.register_class_id
                  and rc.school_id = n.school_id
                  and app_private.staff_member_covers_school_period(
                    staff.id, n.school_id, current_date, current_date
                  )
              )
            )
          )
        )
    );
$$;

revoke all on function app_private.can_review_guardian_absence_notice(uuid)
from public, anon;
grant execute on function app_private.can_review_guardian_absence_notice(uuid)
to authenticated;

comment on function app_private.can_review_guardian_absence_notice(uuid) is
'Need-to-know guardian absence reviewer authorization. Existing leadership/counsellor/class-teacher roles are preserved, staff-linked authority follows authoritative effective placement and deterministic current-school scope, and Platform Support remains denied.';
