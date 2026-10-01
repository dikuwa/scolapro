-- #961: fast-path same-school staff identity visibility before cross-school fallback.
create or replace function app_private.get_sports_house_staff_roster_authorized(
  p_school_id uuid,
  p_academic_year integer
)
returns table (
  staff_member_id uuid,
  first_name text,
  last_name text,
  employee_number text,
  house_id uuid,
  role_key text,
  assignment_source text,
  is_locked boolean,
  assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  viewer_platform_admin boolean;
  placement_allowed boolean;
  assignment_allowed boolean;
begin
  viewer_id := auth.uid();
  if viewer_id is null then
    raise exception 'Authentication required';
  end if;

  viewer_platform_admin := coalesce(
    app_private.has_platform_role(array['platform_admin']::text[]),
    false
  );

  placement_allowed := coalesce(
    viewer_platform_admin
    or app_private.can_access_current_school_staff_directory(p_school_id),
    false
  );

  assignment_allowed := coalesce(
    app_private.has_school_access(p_school_id)
    or viewer_platform_admin,
    false
  );

  return query
  with assignment_rows as materialized (
    select
      a.staff_member_id,
      a.house_id,
      a.role_key,
      a.assignment_source,
      a.is_locked,
      a.assigned_at
    from public.sports_staff_house_assignments a
    where assignment_allowed
      and a.school_id = p_school_id
      and a.academic_year = p_academic_year
  ),
  placement_ids as (
    select distinct p.staff_member_id
    from public.staff_school_assignments p
    where placement_allowed
      and p.school_id = p_school_id
      and p.effective_from <= pg_catalog.make_date(p_academic_year, 12, 31)
      and (p.effective_to is null or p.effective_to >= pg_catalog.make_date(p_academic_year, 1, 1))
  ),
  staff_ids as materialized (
    select placement_ids.staff_member_id from placement_ids
    union
    select assignment_rows.staff_member_id from assignment_rows
  ),
  staff_scope as materialized (
    select
      ids.staff_member_id,
      sm.tenant_id,
      sm.user_id,
      sm.status
    from staff_ids ids
    join public.staff_members sm on sm.id = ids.staff_member_id
  ),
  assignment_history as materialized (
    select distinct a.staff_member_id, a.tenant_id
    from public.staff_school_assignments a
    join staff_scope scope
      on scope.staff_member_id = a.staff_member_id
     and scope.tenant_id = a.tenant_id
  ),
  same_school_current_assignment_coverage as materialized (
    select distinct a.staff_member_id, a.tenant_id
    from public.staff_school_assignments a
    join staff_scope scope
      on scope.staff_member_id = a.staff_member_id
     and scope.tenant_id = a.tenant_id
    where a.school_id = p_school_id
      and a.effective_from <= current_date
      and (a.effective_to is null or a.effective_to >= current_date)
  ),
  same_school_current_membership_coverage as materialized (
    select distinct sm.staff_member_id, sm.tenant_id
    from public.school_memberships sm
    join staff_scope scope
      on scope.staff_member_id = sm.staff_member_id
     and scope.tenant_id = sm.tenant_id
    where sm.staff_member_id is not null
      and sm.school_id = p_school_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ),
  same_school_visible_ids as materialized (
    select scope.staff_member_id
    from staff_scope scope
    left join assignment_history history
      on history.staff_member_id = scope.staff_member_id
     and history.tenant_id = scope.tenant_id
    left join same_school_current_assignment_coverage assignment_coverage
      on assignment_coverage.staff_member_id = scope.staff_member_id
     and assignment_coverage.tenant_id = scope.tenant_id
    left join same_school_current_membership_coverage membership_coverage
      on membership_coverage.staff_member_id = scope.staff_member_id
     and membership_coverage.tenant_id = scope.tenant_id
    where placement_allowed
      and scope.status = 'active'
      and (
        (
          history.staff_member_id is not null
          and assignment_coverage.staff_member_id is not null
        )
        or (
          history.staff_member_id is null
          and membership_coverage.staff_member_id is not null
        )
      )
  ),
  fast_visible_identity_ids as materialized (
    select scope.staff_member_id
    from staff_scope scope
    where viewer_platform_admin
       or scope.user_id = viewer_id
       or exists (
         select 1
         from same_school_visible_ids same_school
         where same_school.staff_member_id = scope.staff_member_id
       )
  ),
  unresolved_staff_scope as materialized (
    select scope.*
    from staff_scope scope
    where not exists (
      select 1
      from fast_visible_identity_ids visible
      where visible.staff_member_id = scope.staff_member_id
    )
  ),
  fallback_target_schools as materialized (
    select a.staff_member_id, a.school_id
    from public.staff_school_assignments a
    join unresolved_staff_scope scope
      on scope.staff_member_id = a.staff_member_id
     and scope.tenant_id = a.tenant_id
    union
    select sm.staff_member_id, sm.school_id
    from public.school_memberships sm
    join unresolved_staff_scope scope
      on scope.staff_member_id = sm.staff_member_id
     and scope.tenant_id = sm.tenant_id
    where sm.staff_member_id is not null
  ),
  fallback_accessible_schools as materialized (
    select distinct ts.school_id
    from fallback_target_schools ts
    where app_private.can_access_current_school_staff_directory(ts.school_id)
  ),
  fallback_current_assignment_coverage as materialized (
    select distinct a.staff_member_id, a.tenant_id, a.school_id
    from public.staff_school_assignments a
    join unresolved_staff_scope scope
      on scope.staff_member_id = a.staff_member_id
     and scope.tenant_id = a.tenant_id
    where a.effective_from <= current_date
      and (a.effective_to is null or a.effective_to >= current_date)
  ),
  fallback_current_membership_coverage as materialized (
    select distinct sm.staff_member_id, sm.tenant_id, sm.school_id
    from public.school_memberships sm
    join unresolved_staff_scope scope
      on scope.staff_member_id = sm.staff_member_id
     and scope.tenant_id = sm.tenant_id
    where sm.staff_member_id is not null
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ),
  fallback_visible_identity_ids as materialized (
    select distinct scope.staff_member_id
    from unresolved_staff_scope scope
    join fallback_target_schools ts
      on ts.staff_member_id = scope.staff_member_id
    join fallback_accessible_schools visible_school
      on visible_school.school_id = ts.school_id
    left join assignment_history history
      on history.staff_member_id = scope.staff_member_id
     and history.tenant_id = scope.tenant_id
    left join fallback_current_assignment_coverage assignment_coverage
      on assignment_coverage.staff_member_id = scope.staff_member_id
     and assignment_coverage.tenant_id = scope.tenant_id
     and assignment_coverage.school_id = ts.school_id
    left join fallback_current_membership_coverage membership_coverage
      on membership_coverage.staff_member_id = scope.staff_member_id
     and membership_coverage.tenant_id = scope.tenant_id
     and membership_coverage.school_id = ts.school_id
    where scope.status = 'active'
      and (
        (
          history.staff_member_id is not null
          and assignment_coverage.staff_member_id is not null
        )
        or (
          history.staff_member_id is null
          and membership_coverage.staff_member_id is not null
        )
      )
  ),
  visible_identity_ids as materialized (
    select fast_visible.staff_member_id
    from fast_visible_identity_ids fast_visible
    union
    select fallback_visible.staff_member_id
    from fallback_visible_identity_ids fallback_visible
  )
  select
    ids.staff_member_id,
    sm.first_name,
    sm.last_name,
    sm.employee_number,
    a.house_id,
    a.role_key,
    a.assignment_source,
    a.is_locked,
    a.assigned_at
  from staff_ids ids
  left join visible_identity_ids visible
    on visible.staff_member_id = ids.staff_member_id
  left join public.staff_members sm
    on sm.id = visible.staff_member_id
  left join assignment_rows a
    on a.staff_member_id = ids.staff_member_id
  order by sm.first_name nulls last, sm.last_name nulls last, ids.staff_member_id;
end;
$$;

revoke all on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) from public, anon;
grant execute on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) to authenticated;

comment on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) is
  'Private SECURITY DEFINER helper for Sports/Houses staff roster reads. Same-school current identity visibility is resolved first; cross-school fallback is restricted to unresolved staff.';