-- Library circulation is a school-operational mutation boundary. Preserve the
-- explicit-user provenance predicate, but require authenticated operational actors
-- to retain effective linked staff placement and deny Platform Support explicitly.

create or replace function app_private.can_manage_ltsm(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= app_private.learning_resource_today()
      and (sm.active_to is null or sm.active_to >= app_private.learning_resource_today())
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select (select auth.uid()) is not null
    and not app_private.has_platform_role(array['platform_support'])
    and exists (
      select 1
      from current_school cs
      where cs.school_id = target_school_id
    )
    and app_private.user_can_manage_ltsm((select auth.uid()), target_school_id)
    and exists (
      select 1
      from public.school_memberships sm
      where sm.user_id = (select auth.uid())
        and sm.school_id = target_school_id
        and sm.role_key in ('school_admin','principal','deputy_principal','librarian','ltsm')
        and sm.active_from <= app_private.learning_resource_today()
        and (sm.active_to is null or sm.active_to >= app_private.learning_resource_today())
        and (
          sm.staff_member_id is null
          or app_private.staff_member_covers_school_period(
            sm.staff_member_id,
            target_school_id,
            app_private.learning_resource_today(),
            app_private.learning_resource_today()
          )
        )
    );
$$;

revoke all on function app_private.can_manage_ltsm(uuid) from public, anon;
grant execute on function app_private.can_manage_ltsm(uuid) to authenticated;

comment on function app_private.can_manage_ltsm(uuid) is
'Authenticated LTSM mutation authority bound to deterministic current school, effective library-role membership, effective linked staff placement, and explicit Platform Support denial.';
