-- Teaching execution authority must remain attached to the actor's deterministic
-- current school and current governed staff placement. Historical schedule/allocation
-- rows remain intact; only present read/author/recorder authority is narrowed.

-- This helper is the existing RLS boundary for pacing plans, pacing items, teaching
-- schedules, lesson-preparation reads and teaching-actual reads/writes. Unlike the
-- private current-school selector it must remain executable by authenticated because
-- it is named directly by RLS policies. SECURITY DEFINER lets it consume the private
-- deterministic selector without granting callers direct access to that helper.
create or replace function app_private.can_access_teaching_plan(
  target_school_id uuid,
  target_teacher_allocation_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()), target_school_id)
      and (
        app_private.has_school_role(
          target_school_id,
          array['school_admin','principal','deputy_principal','hod']
        )
        or exists (
          select 1
          from public.teacher_allocations ta
          join public.staff_members staff
            on staff.id = ta.staff_member_id
           and staff.user_id = (select auth.uid())
           and staff.status = 'active'
          join public.school_memberships sm
            on sm.school_id = ta.school_id
           and sm.staff_member_id = ta.staff_member_id
           and sm.user_id = (select auth.uid())
          where ta.id = target_teacher_allocation_id
            and ta.school_id = target_school_id
            and sm.role_key in ('teacher','class_teacher')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and ta.active_from <= current_date
            and (ta.active_to is null or ta.active_to >= current_date)
            and app_private.staff_member_has_school_assignment(
              ta.staff_member_id,
              target_school_id,
              current_date
            )
        )
      )
    );
$$;

revoke all on function app_private.can_access_teaching_plan(uuid,uuid)
from public,anon;
grant execute on function app_private.can_access_teaching_plan(uuid,uuid)
to authenticated;

create or replace function app_private.enforce_lesson_preparation_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule record;
  v_lesson_date date;
begin
  select tsi.tenant_id,
         tsi.school_id,
         tsi.teacher_allocation_id,
         coalesce(tsi.moved_to_date, tsi.planned_on) as lesson_date,
         ta.staff_member_id as allocation_staff_member_id,
         ta.active_from as allocation_active_from,
         ta.active_to as allocation_active_to
    into v_schedule
    from public.teaching_schedule_items tsi
    join public.teacher_allocations ta
      on ta.id = tsi.teacher_allocation_id
     and ta.tenant_id = tsi.tenant_id
     and ta.school_id = tsi.school_id
   where tsi.id = new.teaching_schedule_item_id;

  if not found then
    raise exception 'Lesson preparation scope mismatch: teaching schedule item or teacher allocation does not exist';
  end if;

  if (new.tenant_id,new.school_id)
     is distinct from (v_schedule.tenant_id,v_schedule.school_id) then
    raise exception 'Lesson preparation scope mismatch: teaching schedule differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.teaching_schedule_item_id is distinct from old.teaching_schedule_item_id
    or new.prepared_by_user_id is distinct from old.prepared_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Lesson preparation root scope and provenance are immutable';
  end if;

  v_lesson_date := v_schedule.lesson_date;

  if not (
    exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = new.prepared_by_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      app_private.user_current_school_matches(new.prepared_by_user_id,new.school_id)
      and (
        exists (
          select 1
          from public.school_memberships sm
          where sm.tenant_id = new.tenant_id
            and sm.school_id = new.school_id
            and sm.user_id = new.prepared_by_user_id
            and sm.role_key = any(array['school_admin','principal','deputy_principal','hod'])
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or (
          v_schedule.allocation_active_from <= v_lesson_date
          and (v_schedule.allocation_active_to is null or v_schedule.allocation_active_to >= v_lesson_date)
          and exists (
            select 1
            from public.staff_members staff
            where staff.id = v_schedule.allocation_staff_member_id
              and staff.user_id = new.prepared_by_user_id
              and staff.status = 'active'
          )
          and exists (
            select 1
            from public.school_memberships sm
            where sm.tenant_id = new.tenant_id
              and sm.school_id = new.school_id
              and sm.user_id = new.prepared_by_user_id
              and sm.role_key = any(array['teacher','class_teacher'])
              and sm.active_from <= current_date
              and (sm.active_to is null or sm.active_to >= current_date)
          )
          and app_private.staff_member_has_school_assignment(
            v_schedule.allocation_staff_member_id,
            new.school_id,
            current_date
          )
        )
      )
    )
  ) then
    raise exception 'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_lesson_preparation_scope_integrity()
from public,anon,authenticated;

create or replace function app_private.enforce_teaching_actual_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule record;
  v_teaching_date date;
begin
  select tsi.tenant_id,
         tsi.school_id,
         tsi.teacher_allocation_id,
         ta.staff_member_id as allocation_staff_member_id,
         ta.active_from as allocation_active_from,
         ta.active_to as allocation_active_to
    into v_schedule
    from public.teaching_schedule_items tsi
    join public.teacher_allocations ta
      on ta.id = tsi.teacher_allocation_id
     and ta.tenant_id = tsi.tenant_id
     and ta.school_id = tsi.school_id
   where tsi.id = new.teaching_schedule_item_id;

  if not found then
    raise exception 'Teaching actual scope mismatch: teaching schedule item or teacher allocation does not exist';
  end if;

  if (new.tenant_id,new.school_id)
     is distinct from (v_schedule.tenant_id,v_schedule.school_id) then
    raise exception 'Teaching actual scope mismatch: teaching schedule differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.teaching_schedule_item_id is distinct from old.teaching_schedule_item_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.recorded_at is distinct from old.recorded_at
  ) then
    raise exception 'Teaching actual root scope and provenance are immutable';
  end if;

  v_teaching_date := coalesce(new.taught_on,current_date);

  if tg_op = 'INSERT' and not (
    exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = new.recorded_by_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      app_private.user_current_school_matches(new.recorded_by_user_id,new.school_id)
      and (
        exists (
          select 1
          from public.school_memberships sm
          where sm.tenant_id = new.tenant_id
            and sm.school_id = new.school_id
            and sm.user_id = new.recorded_by_user_id
            and sm.role_key = any(array['school_admin','principal','deputy_principal','hod'])
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or (
          v_schedule.allocation_active_from <= v_teaching_date
          and (v_schedule.allocation_active_to is null or v_schedule.allocation_active_to >= v_teaching_date)
          and exists (
            select 1
            from public.staff_members staff
            where staff.id = v_schedule.allocation_staff_member_id
              and staff.user_id = new.recorded_by_user_id
              and staff.status = 'active'
          )
          and exists (
            select 1
            from public.school_memberships sm
            where sm.tenant_id = new.tenant_id
              and sm.school_id = new.school_id
              and sm.user_id = new.recorded_by_user_id
              and sm.role_key = any(array['teacher','class_teacher'])
              and sm.active_from <= current_date
              and (sm.active_to is null or sm.active_to >= current_date)
          )
          and app_private.staff_member_has_school_assignment(
            v_schedule.allocation_staff_member_id,
            new.school_id,
            current_date
          )
        )
      )
    )
  ) then
    raise exception 'Teaching actual recorder mismatch: user is not authorized for teaching allocation';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teaching_actual_scope_integrity()
from public,anon,authenticated;

comment on function app_private.can_access_teaching_plan(uuid,uuid) is
'RLS teaching-plan boundary: Platform Admin or current-school academic leadership/active allocated teacher with current governed placement; Platform Support remains excluded.';

comment on function app_private.enforce_lesson_preparation_scope_integrity() is
'Preserves lesson-preparation root provenance and requires current-school authority; allocated teachers must also have a date-valid allocation and current governed placement.';

comment on function app_private.enforce_teaching_actual_scope_integrity() is
'Preserves teaching-actual root provenance and requires current-school authority; allocated teachers must also have an allocation valid on the taught date and current governed placement.';
