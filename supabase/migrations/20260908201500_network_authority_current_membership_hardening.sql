-- Stream B role/permission operational QA follow-up.
-- Historical p_as_of values may select historical school/network facts, but they must
-- never revive an expired circuit/regional authorization. Membership authority is
-- therefore evaluated at current_date while school placement remains effective-dated
-- by p_as_of.

create or replace function app_private.can_view_school_via_network(
  p_school_id uuid,
  p_as_of date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_network_assignments a
      join public.education_network_memberships m
        on m.user_id = auth.uid()
       and m.active_from <= current_date
       and (m.active_to is null or m.active_to >= current_date)
      where a.school_id = p_school_id
        and a.effective_from <= p_as_of
        and (a.effective_to is null or a.effective_to >= p_as_of)
        and (
          (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
          or
          (m.role_key = 'regional_officer' and m.region_id = a.region_id)
        )
    );
$$;

revoke all on function app_private.can_view_school_via_network(uuid, date)
  from public, anon;
grant execute on function app_private.can_view_school_via_network(uuid, date)
  to authenticated;

comment on function app_private.can_view_school_via_network(uuid, date) is
'Authorizes current circuit/regional members to view a school that was effectively inside their current network boundary at p_as_of. Historical p_as_of values never revive expired network membership.';
