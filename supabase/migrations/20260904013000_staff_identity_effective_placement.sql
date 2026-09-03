-- School-scoped raw staff identity reads must follow the target staff member's
-- effective placement period. Historical or future placements are not current
-- school identity authority. Platform Admin and self-read remain unchanged.

create or replace function app_private.can_read_staff_identity(p_staff_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from public.staff_members s
      where s.id=p_staff_member_id
        and s.user_id=auth.uid()
    )
    or exists (
      select 1
      from public.staff_school_assignments a
      where a.staff_member_id=p_staff_member_id
        and a.effective_from<=current_date
        and (a.effective_to is null or a.effective_to>=current_date)
        and app_private.has_school_access(a.school_id)
    )
    or exists (
      select 1
      from public.school_memberships target_membership
      where target_membership.staff_member_id=p_staff_member_id
        and target_membership.active_from<=current_date
        and (target_membership.active_to is null or target_membership.active_to>=current_date)
        and app_private.has_school_access(target_membership.school_id)
    );
$$;

revoke all on function app_private.can_read_staff_identity(uuid) from public,anon;
grant execute on function app_private.can_read_staff_identity(uuid) to authenticated;

comment on function app_private.can_read_staff_identity(uuid) is
'Allows Platform Admin, self-read, or current school-scoped staff identity access when the target staff member has an effective assignment or membership in a school the viewer can currently access.';
