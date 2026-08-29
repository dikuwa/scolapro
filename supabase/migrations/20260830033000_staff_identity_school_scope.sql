-- Staff identity is tenant-wide so one person can move between schools, but tenant
-- membership alone must not expose every staff identity across every school.
-- Keep raw staff rows visible to the staff member themself, platform administration,
-- or users who share at least one school relationship with that staff identity.

create or replace function app_private.can_read_staff_identity(p_staff_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select
    app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.staff_members s
      where s.id=p_staff_member_id
        and s.user_id=(select auth.uid())
    )
    or exists(
      select 1
      from public.staff_school_assignments a
      where a.staff_member_id=p_staff_member_id
        and app_private.has_school_access(a.school_id)
    )
    or exists(
      select 1
      from public.school_memberships target_membership
      where target_membership.staff_member_id=p_staff_member_id
        and app_private.has_school_access(target_membership.school_id)
    );
$$;

revoke all on function app_private.can_read_staff_identity(uuid) from public,anon;
grant execute on function app_private.can_read_staff_identity(uuid) to authenticated;

drop policy if exists "members can read school staff" on public.staff_members;
drop policy if exists "scoped users read staff identities" on public.staff_members;

create policy "scoped users read staff identities"
on public.staff_members for select to authenticated
using (app_private.can_read_staff_identity(id));

-- Raw staff identity mutations are already denied by RLS; close the table-level
-- privilege as well so application writes remain on governed RPC/import boundaries.
revoke insert,update,delete on public.staff_members from authenticated;
revoke all on public.staff_members from anon;
grant select on public.staff_members to authenticated;

comment on function app_private.can_read_staff_identity(uuid) is
'Raw staff identity visibility is school-scoped: platform admin, the staff member themself, or a user sharing a school assignment/membership with that staff identity.';

comment on policy "scoped users read staff identities" on public.staff_members is
'Prevents tenant-wide staff identity leakage while preserving multi-school staff mobility and historical school relationships.';
