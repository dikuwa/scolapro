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

-- A register-class authorization check must first satisfy the school-operational
-- current-scope boundary. Keep the existing class/teacher allocation semantics,
-- but fail closed before the legacy role helper can authorize a stale or non-current
-- membership. Raising the public RPC contract error here keeps denial deterministic.
create or replace function app_private.can_record_register_class(target_register_class_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  select rc.school_id
    into v_school_id
  from public.register_classes rc
  where rc.id = target_register_class_id;

  if v_school_id is null then
    return false;
  end if;

  if not app_private.can_record_attendance(v_school_id) then
    raise exception 'Permission denied';
  end if;

  return exists (
    select 1
    from public.register_classes rc
    where rc.id = target_register_class_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(rc.school_id, array['school_admin','principal','deputy_principal','hod'])
        or exists (
          select 1
          from public.school_memberships sm
          where sm.school_id = rc.school_id
            and sm.user_id = (select auth.uid())
            and sm.staff_member_id is not null
            and sm.role_key in ('teacher','class_teacher')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and (
              rc.register_teacher_staff_id = sm.staff_member_id
              or exists (
                select 1
                from public.teacher_allocations ta
                where ta.school_id = rc.school_id
                  and ta.register_class_id = rc.id
                  and ta.academic_year = rc.academic_year
                  and ta.staff_member_id = sm.staff_member_id
                  and ta.active_from <= current_date
                  and (ta.active_to is null or ta.active_to >= current_date)
              )
            )
        )
      )
  );
end;
$$;

grant execute on function app_private.can_record_register_class(uuid) to authenticated;

comment on function app_private.can_record_register_class(uuid) is
'Class-scoped attendance authorization after deterministic current-school, effective-placement and Platform Support denial.';

-- Attendance submissions/events are a school-operational surface. Remove every
-- older permissive SELECT policy on these two tables before installing the single
-- authoritative current-scope predicate; otherwise PostgreSQL ORs old policies
-- with the hardened policy and stale/non-current access remains possible.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('attendance_events','attendance_register_submissions')
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

create policy "school members can read attendance events"
on public.attendance_events for select
to authenticated
using (app_private.can_read_current_attendance(school_id));

create policy "school members can read register submissions"
on public.attendance_register_submissions for select
to authenticated
using (app_private.can_read_current_attendance(school_id));
