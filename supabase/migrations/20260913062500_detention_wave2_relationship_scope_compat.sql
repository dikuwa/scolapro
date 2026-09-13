-- Compatibility correction for Wave 2 current-scope hardening.
-- Explicit staff duty/session-supervisor relationships remain authoritative even when
-- the staff account has no school_membership row. If an actor does have active school
-- memberships, delegated duty is limited to the deterministic current school.

create or replace function app_private.can_coordinate_current_detention_school(
  p_school_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_manage_current_detention_school(p_school_id)
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and (
        not exists (
          select 1
          from public.school_memberships sm
          where sm.user_id = (select auth.uid())
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or app_private.detention_current_school_is((select auth.uid()), p_school_id)
      )
      and exists (
        select 1
        from public.school_duty_assignments d
        join public.staff_members staff
          on staff.id = d.staff_member_id
         and staff.user_id = (select auth.uid())
         and staff.status = 'active'
        where d.school_id = p_school_id
          and d.duty_key = 'late_arrival_recorder'
          and d.active_from <= p_on_date
          and (d.active_to is null or d.active_to >= p_on_date)
          and app_private.staff_member_has_school_assignment(
            staff.id,
            p_school_id,
            p_on_date
          )
      )
    );
$$;

create or replace function app_private.can_supervise_current_detention_session(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and not app_private.has_platform_role(array['platform_support'])
    and exists (
      select 1
      from public.detention_sessions ds
      where ds.id = p_session_id
        and (
          exists (
            select 1
            from public.staff_members staff
            where staff.id = ds.supervisor_staff_member_id
              and staff.user_id = (select auth.uid())
              and staff.status = 'active'
              and app_private.staff_member_has_school_assignment(
                staff.id,
                ds.school_id,
                ds.session_date
              )
          )
          or exists (
            select 1
            from public.detention_session_supervisors team
            join public.staff_members staff
              on staff.id = team.staff_member_id
             and staff.user_id = (select auth.uid())
             and staff.status = 'active'
            where team.detention_session_id = ds.id
              and app_private.staff_member_has_school_assignment(
                staff.id,
                ds.school_id,
                ds.session_date
              )
          )
        )
    );
$$;

create or replace function app_private.can_read_current_detention_school(
  p_school_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and (
        (
          app_private.detention_current_school_is((select auth.uid()), p_school_id)
          and app_private.can_view_operational_learners(p_school_id)
        )
        or (
          (
            not exists (
              select 1
              from public.school_memberships sm
              where sm.user_id = (select auth.uid())
                and sm.active_from <= current_date
                and (sm.active_to is null or sm.active_to >= current_date)
            )
            or app_private.detention_current_school_is((select auth.uid()), p_school_id)
          )
          and exists (
            select 1
            from public.school_duty_assignments d
            join public.staff_members staff
              on staff.id = d.staff_member_id
             and staff.user_id = (select auth.uid())
             and staff.status = 'active'
            where d.school_id = p_school_id
              and d.duty_key = 'late_arrival_recorder'
              and d.active_from <= p_on_date
              and (d.active_to is null or d.active_to >= p_on_date)
              and app_private.staff_member_has_school_assignment(
                staff.id,
                p_school_id,
                p_on_date
              )
          )
        )
      )
    );
$$;

-- Preserve the existing assigned-obligation completion relationship while applying
-- explicit Platform Support separation. The delegated helper already validates active
-- staff identity and due-date school placement.
create or replace function public.resolve_late_detention(
  p_obligation_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_supervisor_allowed boolean := false;
begin
  select * into v_item
  from public.late_detention_obligations
  where id = p_obligation_id;

  if not found then
    raise exception 'Detention obligation not found';
  end if;

  if p_status = 'completed'
     and not app_private.has_platform_role(array['platform_support']) then
    v_supervisor_allowed := app_private.is_assigned_late_detention_supervisor(p_obligation_id);
  end if;

  if not app_private.can_coordinate_current_detention_school(v_item.school_id, current_date)
     and not v_supervisor_allowed then
    raise exception 'Permission denied';
  end if;

  return public.resolve_late_detention_wave2_unscoped(
    p_obligation_id,
    p_status,
    p_note
  );
end;
$$;

revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon;
grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;

comment on function app_private.can_supervise_current_detention_session(uuid) is
'Live detention supervisor boundary: explicit primary/team assignment, active staff identity, effective session-date school placement, and Platform Support denial. Supervisor authority does not require a redundant school_membership row.';
