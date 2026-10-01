-- #931: bundle shared authenticated user context into one self-scoped RPC.
--
-- Identity is always derived from auth.uid(); callers cannot request another
-- user's context. The server supplies p_as_of explicitly so active-date
-- semantics remain deterministic.

create or replace function public.get_my_user_context(p_as_of date)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with caller as (
    select auth.uid() as user_id
  )
  select jsonb_build_object(
    'profile',
      (
        select jsonb_build_object(
          'display_name', up.display_name,
          'preferred_name', up.preferred_name,
          'avatar_path', up.avatar_path,
          'must_change_password', up.must_change_password
        )
        from public.user_profiles up
        where up.user_id = c.user_id
      ),
    'school_memberships',
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
          where sm.user_id = c.user_id
            and sm.active_from <= p_as_of
            and (sm.active_to is null or sm.active_to >= p_as_of)
        ),
        '[]'::jsonb
      ),
    'platform_memberships',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'role_key', pm.role_key
            )
          )
          from public.platform_memberships pm
          where pm.user_id = c.user_id
            and pm.active_from <= p_as_of
            and (pm.active_to is null or pm.active_to >= p_as_of)
        ),
        '[]'::jsonb
      ),
    'network_memberships',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', nm.id,
              'role_key', nm.role_key
            )
            order by nm.active_from desc, nm.id
          )
          from public.education_network_memberships nm
          where nm.user_id = c.user_id
            and nm.active_from <= p_as_of
            and (nm.active_to is null or nm.active_to >= p_as_of)
        ),
        '[]'::jsonb
      ),
    'guardian_links',
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
          where gul.user_id = c.user_id
        ),
        '[]'::jsonb
      )
  )
  from caller c;
$$;

revoke all on function public.get_my_user_context(date) from public;
revoke all on function public.get_my_user_context(date) from anon;
grant execute on function public.get_my_user_context(date) to authenticated;

comment on function public.get_my_user_context(date) is
  'Returns the authenticated caller''s profile, active school/platform/network memberships, and guardian links as of the supplied date. Caller identity is derived only from auth.uid().';
