-- Issue #1047: preserve deterministic current-school selection while allowing
-- simultaneous active roles inside that same school to contribute authority.
-- Cross-school authority remains denied and linked staff memberships still
-- require an effective placement in the resolved current school.

create or replace function app_private.has_school_local_role(
  p_school_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  with current_membership as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id=(select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_membership current_scope
    join public.school_memberships sm
      on sm.school_id=current_scope.school_id
     and sm.user_id=(select auth.uid())
     and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
     and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    where current_scope.school_id=p_school_id
      and sm.role_key=any(p_allowed_roles)
      and (
        sm.staff_member_id is null
        or exists (
          select 1
          from public.staff_school_assignments ssa
          where ssa.staff_member_id=sm.staff_member_id
            and ssa.school_id=current_scope.school_id
            and ssa.effective_from <= (now() at time zone 'Africa/Windhoek')::date
            and (ssa.effective_to is null or ssa.effective_to >= (now() at time zone 'Africa/Windhoek')::date)
        )
      )
  );
$$;

revoke all on function app_private.has_school_local_role(uuid,text[])
from public,anon,authenticated;
grant execute on function app_private.has_school_local_role(uuid,text[]) to authenticated;

comment on function app_private.has_school_local_role(uuid,text[]) is
'Live school-operational role predicate. The actor current school remains deterministic from the newest active membership (active_from DESC, id ASC); any simultaneous active role in that same current school may satisfy the requested role set, with effective staff placement required when linked.';
