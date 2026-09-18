-- Wave 3 / Stream B (#469): teaching actuals are execution records owned by
-- the allocated teacher. Leadership visibility must not become mutation authority,
-- and platform roles remain outside school-operational recording.
--
-- The existing can_access_teaching_plan predicate is intentionally broad for reads
-- (school leadership can inspect teaching). It must therefore not be reused as the
-- INSERT authority for teaching_actuals. This migration adds the narrow recorder
-- predicate and consumes it in both RLS and the existing integrity trigger.
create or replace function app_private.can_record_teaching_actual(
  p_user_id uuid,
  p_school_id uuid,
  p_teacher_allocation_id uuid,
  p_taught_on date
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select p_user_id is not null
    and p_school_id is not null
    and p_teacher_allocation_id is not null
    and p_taught_on is not null
    and not exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    and app_private.user_current_school_matches(p_user_id, p_school_id)
    and exists (
      select 1
      from public.teacher_allocations ta
      join public.staff_members staff
        on staff.id = ta.staff_member_id
       and staff.user_id = p_user_id
       and staff.status = 'active'
      join public.school_memberships sm
        on sm.tenant_id = ta.tenant_id
       and sm.school_id = ta.school_id
       and sm.user_id = p_user_id
       and sm.role_key in ('teacher','class_teacher')
       and sm.active_from <= current_date
       and (sm.active_to is null or sm.active_to >= current_date)
      where ta.id = p_teacher_allocation_id
        and ta.school_id = p_school_id
        and ta.active_from <= p_taught_on
        and (ta.active_to is null or ta.active_to >= p_taught_on)
        and app_private.staff_member_has_school_assignment(
          ta.staff_member_id,
          p_school_id,
          current_date
        )
    );
$$;

revoke all on function app_private.can_record_teaching_actual(uuid,uuid,uuid,date)
from public, anon;
grant execute on function app_private.can_record_teaching_actual(uuid,uuid,uuid,date)
to authenticated;

comment on function app_private.can_record_teaching_actual(uuid,uuid,uuid,date) is
'Teaching-actual recorder boundary: current-school teacher/class_teacher whose staff identity owns the allocation, whose allocation covers the taught date and whose governed staff placement is current. The membership need not duplicate staff_member_id because governed placement is carried by staff_school_assignments. Leadership-only and all platform memberships are excluded.';

drop policy if exists "recording teacher can create teaching actuals"
on public.teaching_actuals;

create policy "recording teacher can create teaching actuals"
on public.teaching_actuals
for insert
to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and exists (
    select 1
    from public.teaching_schedule_items tsi
    where tsi.id = teaching_actuals.teaching_schedule_item_id
      and tsi.school_id = teaching_actuals.school_id
      and app_private.can_record_teaching_actual(
        (select auth.uid()),
        tsi.school_id,
        tsi.teacher_allocation_id,
        coalesce(teaching_actuals.taught_on, current_date)
      )
  )
);

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
         tsi.teacher_allocation_id
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

  if tg_op = 'INSERT' and not app_private.can_record_teaching_actual(
    new.recorded_by_user_id,
    new.school_id,
    v_schedule.teacher_allocation_id,
    v_teaching_date
  ) then
    raise exception 'Teaching actual recorder mismatch: user is not authorized for teaching allocation';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teaching_actual_scope_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_teaching_actual_scope_integrity() is
'Preserves teaching-actual root provenance and requires the exact current-school allocated teacher recorder boundary. Leadership-only and platform users cannot record teaching actuals.';
