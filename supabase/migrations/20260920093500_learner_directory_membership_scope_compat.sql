-- Restore learner-directory access for a deterministic current-school member
-- whose staff identity has no governed assignment history yet, while preserving
-- the stale-placement denial once staff_school_assignments exists.
--
-- Compatibility rule:
-- - non-staff/current-school memberships remain valid;
-- - a staff-linked membership with no assignment history may fall back to the
--   current school membership;
-- - once assignment history exists for that staff member in the school, an
--   assignment effective today is authoritative and required;
-- - Platform Admin retains governed oversight; Platform Support has no override.

create or replace function app_private.can_access_current_school_learner_directory(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with current_membership as (
    select sm.school_id, sm.staff_member_id
    from public.school_memberships sm
    where sm.user_id=(select auth.uid())
      and sm.school_id=p_school_id
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
      and app_private.user_targets_current_school((select auth.uid()),sm.school_id)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from current_membership cm
      where
        (
          cm.staff_member_id is null
          and not exists (
            select 1
            from public.staff_members s
            where s.user_id=(select auth.uid())
          )
        )
        or exists (
          select 1
          from public.staff_members s
          where s.user_id=(select auth.uid())
            and (cm.staff_member_id is null or s.id=cm.staff_member_id)
            and (
              (
                not exists (
                  select 1
                  from public.staff_school_assignments history
                  where history.staff_member_id=s.id
                    and history.school_id=cm.school_id
                )
              )
              or exists (
                select 1
                from public.staff_school_assignments current_assignment
                where current_assignment.staff_member_id=s.id
                  and current_assignment.school_id=cm.school_id
                  and current_assignment.effective_from <= (now() at time zone 'Africa/Windhoek')::date
                  and (
                    current_assignment.effective_to is null
                    or current_assignment.effective_to >= (now() at time zone 'Africa/Windhoek')::date
                  )
              )
            )
        )
    );
$$;

revoke all on function app_private.can_access_current_school_learner_directory(uuid)
from public,anon;
grant execute on function app_private.can_access_current_school_learner_directory(uuid)
to authenticated;

comment on function app_private.can_access_current_school_learner_directory(uuid) is
'Learner directory scope: Platform Admin or the deterministic current-school member. Staff-linked memberships may fall back to membership only before assignment history exists; once assignment history exists, an assignment effective today is required. Platform Support has no override.';
