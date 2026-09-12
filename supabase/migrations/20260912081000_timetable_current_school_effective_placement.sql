-- Timetable, room, and teacher-allocation mutations are school-local operations.
-- Keep existing role checks, conflict guards, room integrity, and calendar-cycle behavior,
-- while preventing an older still-active school membership from being targeted directly.

create or replace function app_private.enforce_current_school_timetable_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  -- Trusted bootstrap/history writes without request identity retain existing behavior.
  if auth.uid() is null then
    return case when tg_op='DELETE' then old else new end;
  end if;

  v_school_id := case when tg_op='DELETE' then old.school_id else new.school_id end;

  if not app_private.user_targets_current_school(auth.uid(), v_school_id) then
    raise exception 'Timetable mutation must target the current school' using errcode='42501';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function app_private.enforce_current_school_timetable_mutation() from public,anon,authenticated;

-- These triggers are an invariant beneath both SECURITY DEFINER RPCs and direct RLS writes.
-- Existing RPC/RLS role authorization remains authoritative; this only adds deterministic
-- current-school targeting.
drop trigger if exists teacher_allocations_current_school_mutation on public.teacher_allocations;
create trigger teacher_allocations_current_school_mutation
before insert or update or delete on public.teacher_allocations
for each row execute function app_private.enforce_current_school_timetable_mutation();

drop trigger if exists timetable_periods_current_school_mutation on public.timetable_periods;
create trigger timetable_periods_current_school_mutation
before insert or update or delete on public.timetable_periods
for each row execute function app_private.enforce_current_school_timetable_mutation();

drop trigger if exists timetable_slots_current_school_mutation on public.timetable_slots;
create trigger timetable_slots_current_school_mutation
before insert or update or delete on public.timetable_slots
for each row execute function app_private.enforce_current_school_timetable_mutation();

drop trigger if exists school_rooms_current_school_mutation on public.school_rooms;
create trigger school_rooms_current_school_mutation
before insert or update or delete on public.school_rooms
for each row execute function app_private.enforce_current_school_timetable_mutation();

-- Once authoritative staff placement history exists, it owns timetable allocation
-- eligibility. A stale school_memberships row may no longer extend authority after the
-- authoritative placement has ended. Legacy membership fallback remains only for staff
-- with no staff_school_assignments history at all.
create or replace function app_private.staff_member_covers_school_period(
  p_staff_member_id uuid,
  p_school_id uuid,
  p_active_from date,
  p_active_to date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_active_from is not null
    and (p_active_to is null or p_active_to>=p_active_from)
    and exists(
      select 1
      from public.staff_members staff
      where staff.id=p_staff_member_id
        and staff.status='active'
        and (
          (
            exists(
              select 1
              from public.staff_school_assignments history
              where history.staff_member_id=staff.id
                and history.tenant_id=staff.tenant_id
            )
            and exists(
              select 1
              from public.staff_school_assignments ssa
              where ssa.staff_member_id=staff.id
                and ssa.school_id=p_school_id
                and ssa.tenant_id=staff.tenant_id
                and ssa.effective_from<=p_active_from
                and (
                  (p_active_to is null and ssa.effective_to is null)
                  or (p_active_to is not null and (ssa.effective_to is null or ssa.effective_to>=p_active_to))
                )
            )
          )
          or (
            not exists(
              select 1
              from public.staff_school_assignments history
              where history.staff_member_id=staff.id
                and history.tenant_id=staff.tenant_id
            )
            and exists(
              select 1
              from public.school_memberships sm
              where sm.staff_member_id=staff.id
                and sm.school_id=p_school_id
                and sm.tenant_id=staff.tenant_id
                and sm.active_from<=p_active_from
                and (
                  (p_active_to is null and sm.active_to is null)
                  or (p_active_to is not null and (sm.active_to is null or sm.active_to>=p_active_to))
                )
            )
          )
        )
    );
$$;
revoke all on function app_private.staff_member_covers_school_period(uuid,uuid,date,date) from public,anon,authenticated;

comment on function app_private.enforce_current_school_timetable_mutation() is
'Invariant for school-local timetable/room/allocation writes: authenticated mutations must target the deterministic current school; existing role authorization remains separate.';
comment on function app_private.staff_member_covers_school_period(uuid,uuid,date,date) is
'Checks full-period teacher placement coverage. Authoritative staff_school_assignments history takes precedence over legacy school_memberships fallback.';