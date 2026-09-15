-- Daily attendance is school-operational. Preserve the existing append/replacement
-- model and role set while binding live read/write authority to the deterministic
-- current school, effective linked staff placement, and Platform Support denial.

create or replace function app_private.user_can_record_daily_attendance(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      not exists (
        select 1
        from public.platform_memberships pm
        where pm.user_id = p_user_id
          and pm.role_key = 'platform_support'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      )
      and p_school_id = (
        select sm_current.school_id
        from public.school_memberships sm_current
        where sm_current.user_id = p_user_id
          and sm_current.active_from <= current_date
          and (sm_current.active_to is null or sm_current.active_to >= current_date)
        order by sm_current.active_from desc, sm_current.id asc
        limit 1
      )
      and exists (
        select 1
        from public.school_memberships sm
        where sm.school_id = p_school_id
          and sm.user_id = p_user_id
          and sm.role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_has_school_assignment(
              sm.staff_member_id,
              p_school_id,
              current_date
            )
          )
      )
    )
  );
$$;

revoke all on function app_private.user_can_record_daily_attendance(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_record_daily_attendance(uuid,uuid) is
'Arbitrary-user daily attendance authority: active Platform Admin, or a non-Support attendance-role member of the deterministic current school whose linked staff placement is effective today.';

create or replace function app_private.can_record_attendance(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_record_daily_attendance((select auth.uid()), target_school_id);
$$;

revoke all on function app_private.can_record_attendance(uuid) from public, anon;
grant execute on function app_private.can_record_attendance(uuid) to authenticated;

create or replace function app_private.can_read_current_attendance(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and not app_private.has_platform_role(array['platform_support'])
    and p_school_id = (
      select sm_current.school_id
      from public.school_memberships sm_current
      where sm_current.user_id = (select auth.uid())
        and sm_current.active_from <= current_date
        and (sm_current.active_to is null or sm_current.active_to >= current_date)
      order by sm_current.active_from desc, sm_current.id asc
      limit 1
    )
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = (select auth.uid())
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
        and (
          sm.staff_member_id is null
          or app_private.staff_member_has_school_assignment(
            sm.staff_member_id,
            p_school_id,
            current_date
          )
        )
    );
$$;

revoke all on function app_private.can_read_current_attendance(uuid) from public, anon;
grant execute on function app_private.can_read_current_attendance(uuid) to authenticated;

comment on function app_private.can_read_current_attendance(uuid) is
'Current daily-attendance read boundary: deterministic current-school membership, effective linked staff placement, and explicit Platform Support denial.';

drop policy if exists "school members can read attendance events" on public.attendance_events;
create policy "school members can read attendance events"
on public.attendance_events for select
to authenticated
using (app_private.can_read_current_attendance(school_id));

drop policy if exists "school members can read register submissions" on public.attendance_register_submissions;
create policy "school members can read register submissions"
on public.attendance_register_submissions for select
to authenticated
using (app_private.can_read_current_attendance(school_id));
