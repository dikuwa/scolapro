-- Timetable operational reads are school-local just like timetable mutations.
-- Preserve #427 mutation/placement/conflict semantics while preventing an older
-- still-active school membership from exposing timetable operations.

create or replace function app_private.can_read_current_school_timetable(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_targets_current_school((select auth.uid()), target_school_id)
    and app_private.has_school_access(target_school_id);
$$;

revoke all on function app_private.can_read_current_school_timetable(uuid)
from public,anon;
grant execute on function app_private.can_read_current_school_timetable(uuid)
to authenticated;

-- Replace the original broad any-active-membership SELECT policies. PostgreSQL ORs
-- permissive policies, so the superseded policies must be removed rather than layered.
drop policy if exists "members can read teacher allocations" on public.teacher_allocations;
create policy "current school members can read teacher allocations"
on public.teacher_allocations for select to authenticated
using (app_private.can_read_current_school_timetable(school_id));

drop policy if exists "members can read timetable periods" on public.timetable_periods;
create policy "current school members can read timetable periods"
on public.timetable_periods for select to authenticated
using (app_private.can_read_current_school_timetable(school_id));

drop policy if exists "members can read timetable slots" on public.timetable_slots;
create policy "current school members can read timetable slots"
on public.timetable_slots for select to authenticated
using (app_private.can_read_current_school_timetable(school_id));

-- Rooms historically allow Platform Admin read access. Preserve that explicit behavior;
-- Platform Support remains excluded unless it also has legitimate current-school membership.
drop policy if exists "school members read rooms" on public.school_rooms;
create policy "current school members and platform admins read rooms"
on public.school_rooms for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.can_read_current_school_timetable(school_id)
);

comment on function app_private.can_read_current_school_timetable(uuid) is
'RLS wrapper for timetable operational reads: authenticated school access must target the deterministic current school; cross-school Platform Admin behavior is not implied except where a table policy explicitly preserves it.';
