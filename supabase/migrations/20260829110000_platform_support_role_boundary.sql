-- Platform support is a troubleshooting role, not a wildcard School Admin/Teacher/etc.
-- Keep explicit support-safe metadata/audit helpers intact, but remove automatic
-- platform_support success from the generic school-role predicate used by operational
-- domain permissions. Platform administrators retain cross-school administrative scope.

create or replace function app_private.has_school_role(
  target_school_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key=any(allowed_roles)
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.has_school_role(uuid,text[]) from public,anon;
grant execute on function app_private.has_school_role(uuid,text[]) to authenticated;

comment on function app_private.has_school_role(uuid,text[]) is
'Operational school-role predicate. Platform admin may act cross-school; platform support does not automatically inherit any School Admin, teacher, finance, exam, counselling, LTSM, attendance or other school role. Support access must be granted explicitly by a support-safe helper/policy.';