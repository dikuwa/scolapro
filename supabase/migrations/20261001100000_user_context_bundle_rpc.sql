-- #931: bundle the five shared authenticated user-context reads into one
-- self-scoped RPC. Caller identity remains derived exclusively from auth.uid().
create or replace function public.get_my_user_context(p_as_of_date date)
returns table (
  profile jsonb,
  school_memberships jsonb,
  platform_memberships jsonb,
  network_memberships jsonb,
  guardian_links jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with caller as (
    select auth.uid() as user_id
  )
  select
    (
      select jsonb_build_object(
        'display_name', up.display_name,
        'preferred_name', up.preferred_name,
        'avatar_path', up.avatar_path,
        'must_change_password', up.must_change_password
      )
      from public.user_profiles up
      cross join caller c
      where c.user_id is not null
        and up.user_id = c.user_id
      limit 1
    ) as profile,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', sm.id,
            'tenant_id', sm.tenant_id,
            'school_id', sm.school_id,
            'school_name', s.name,
            'role_key', sm.role_key,
            'staff_member_id', sm.staff_member_id
          )
          order by sm.active_from desc, sm.id
        )
        from public.school_memberships sm
        join public.schools s on s.id = sm.school_id
        cross join caller c
        where c.user_id is not null
          and sm.user_id = c.user_id
          and sm.active_from <= p_as_of_date
          and (sm.active_to is null or sm.active_to >= p_as_of_date)
      ),
      '[]'::jsonb
    ) as school_memberships,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'role_key', pm.role_key
          )
        )
        from public.platform_memberships pm
        cross join caller c
        where c.user_id is not null
          and pm.user_id = c.user_id
          and pm.active_from <= p_as_of_date
          and (pm.active_to is null or pm.active_to >= p_as_of_date)
      ),
      '[]'::jsonb
    ) as platform_memberships,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', enm.id,
            'role_key', enm.role_key
          )
          order by enm.active_from desc, enm.id
        )
        from public.education_network_memberships enm
        cross join caller c
        where c.user_id is not null
          and enm.user_id = c.user_id
          and enm.active_from <= p_as_of_date
          and (enm.active_to is null or enm.active_to >= p_as_of_date)
      ),
      '[]'::jsonb
    ) as network_memberships,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'link_id', gul.id,
            'tenant_id', gul.tenant_id,
            'guardian_id', gul.guardian_id
          )
        )
        from public.guardian_user_links gul
        cross join caller c
        where c.user_id is not null
          and gul.user_id = c.user_id
      ),
      '[]'::jsonb
    ) as guardian_links
  from caller;
$$;

revoke all on function public.get_my_user_context(date) from public, anon;
grant execute on function public.get_my_user_context(date) to authenticated;

comment on function public.get_my_user_context(date) is
  'Returns the authenticated caller profile, active school/platform/network memberships and guardian links for an explicit as-of date. Caller identity is always auth.uid().';
