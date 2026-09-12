-- Admissions, transfers and progression are school-local operational workflows.
-- Bind live authorization to the deterministic current school and, where the
-- membership is linked to a staff identity, require an effective placement in
-- that same school. Historical explicit-user provenance helpers remain unchanged.

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
    select sm.id, sm.school_id, sm.role_key, sm.staff_member_id
    from public.school_memberships sm
    where sm.user_id=(select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_membership cm
    where cm.school_id=p_school_id
      and cm.role_key=any(p_allowed_roles)
      and (
        cm.staff_member_id is null
        or exists (
          select 1
          from public.staff_school_assignments ssa
          where ssa.staff_member_id=cm.staff_member_id
            and ssa.school_id=cm.school_id
            and ssa.effective_from <= (now() at time zone 'Africa/Windhoek')::date
            and (ssa.effective_to is null or ssa.effective_to >= (now() at time zone 'Africa/Windhoek')::date)
        )
      )
  );
$$;

revoke all on function app_private.has_school_local_role(uuid,text[])
from public,anon,authenticated;
grant execute on function app_private.has_school_local_role(uuid,text[]) to authenticated;

create or replace function app_private.can_manage_enrolment_workflow(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_school_local_role(
    target_school_id,
    array['school_admin','principal','deputy_principal']
  );
$$;

revoke all on function app_private.can_manage_enrolment_workflow(uuid)
from public,anon,authenticated;
grant execute on function app_private.can_manage_enrolment_workflow(uuid) to authenticated;

comment on function app_private.has_school_local_role(uuid,text[]) is
'Live school-operational role predicate bound to the actor deterministic current school (active_from DESC, id ASC); linked staff memberships additionally require an effective placement in that school.';

comment on function app_private.can_manage_enrolment_workflow(uuid) is
'Admissions/transfer/progression management predicate bound to deterministic current-school authority through has_school_local_role().';
