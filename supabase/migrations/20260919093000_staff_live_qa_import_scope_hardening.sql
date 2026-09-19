-- Issue #526: staff live/source QA hardening.
--
-- The import staging tables are shared infrastructure, but school import authority is
-- operational school authority. Bind it to deterministic current-school/effective
-- placement semantics while preserving governed Platform Admin access.

create or replace function app_private.can_manage_school_imports(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with actor as (
    select (select auth.uid()) as user_id
  ),
  today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  )
  select (select user_id from actor) is not null
    and not exists (
      select 1
      from public.platform_memberships pm
      cross join today t
      where pm.user_id=(select user_id from actor)
        and pm.role_key='platform_support'
        and pm.active_from<=t.value
        and (pm.active_to is null or pm.active_to>=t.value)
    )
    and (
      exists (
        select 1
        from public.platform_memberships pm
        cross join today t
        where pm.user_id=(select user_id from actor)
          and pm.role_key='platform_admin'
          and pm.active_from<=t.value
          and (pm.active_to is null or pm.active_to>=t.value)
      )
      or (
        app_private.user_targets_current_school((select user_id from actor),p_school_id)
        and exists (
          select 1
          from public.school_memberships sm
          cross join today t
          where sm.school_id=p_school_id
            and sm.user_id=(select user_id from actor)
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=t.value
            and (sm.active_to is null or sm.active_to>=t.value)
            and (
              sm.staff_member_id is null
              or app_private.staff_member_covers_school_period(
                sm.staff_member_id,
                p_school_id,
                t.value,
                t.value
              )
            )
        )
      )
    );
$$;

revoke all on function app_private.can_manage_school_imports(uuid) from public,anon;
grant execute on function app_private.can_manage_school_imports(uuid) to authenticated;

comment on function app_private.can_manage_school_imports(uuid) is
'School import authority is deterministic-current-school leadership with effective linked staff placement; Platform Support is excluded and governed Platform Admin cross-school authority is retained.';
