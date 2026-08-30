-- Platform Support intentionally keeps generic support-safe metadata and audit-read
-- access through has_school_access/can_view_audit. That must not imply visibility of
-- school identity-assignment ledgers or authority to author arbitrary school audit rows.

create or replace function app_private.has_school_membership_scope(p_school_id uuid)
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
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.has_school_membership_scope(uuid) from public,anon;
grant execute on function app_private.has_school_membership_scope(uuid) to authenticated;

-- Staff identity visibility uses the stricter identity scope rather than generic
-- support-safe metadata access. Staff can still read themself; Platform Admin retains
-- cross-school scope; actual school members can read staff related to their school.
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
        and app_private.has_school_membership_scope(a.school_id)
    )
    or exists(
      select 1
      from public.school_memberships target_membership
      where target_membership.staff_member_id=p_staff_member_id
        and app_private.has_school_membership_scope(target_membership.school_id)
    );
$$;

revoke all on function app_private.can_read_staff_identity(uuid) from public,anon;
grant execute on function app_private.can_read_staff_identity(uuid) to authenticated;

-- School membership and staff-school assignment ledgers reveal identity/role
-- relationships. They remain available to actual school members and Platform Admin,
-- but not to generic Platform Support solely by virtue of support-safe metadata scope.
drop policy if exists "members can read own memberships" on public.school_memberships;
drop policy if exists "school members read scoped memberships" on public.school_memberships;
create policy "school members read scoped memberships"
on public.school_memberships for select to authenticated
using (
  user_id=(select auth.uid())
  or app_private.has_school_membership_scope(school_id)
);

drop policy if exists "school members read staff assignments" on public.staff_school_assignments;
create policy "school members read staff assignments"
on public.staff_school_assignments for select to authenticated
using (app_private.has_school_membership_scope(school_id));

-- Audit read remains deliberately available to Platform Support through can_view_audit.
-- Audit authorship is different: only Platform Admin or an actual school member may
-- append a school-scoped client audit event, and the actor must still be the caller.
drop policy if exists "authenticated members can record scoped audit events" on public.audit_events;
drop policy if exists "authenticated school actors record scoped audit events" on public.audit_events;
create policy "authenticated school actors record scoped audit events"
on public.audit_events for insert to authenticated
with check (
  actor_user_id=(select auth.uid())
  and school_id is not null
  and app_private.has_school_membership_scope(school_id)
);

comment on function app_private.has_school_membership_scope(uuid) is
'Identity/authoring school scope: Platform Admin or an active school member. Generic Platform Support is intentionally excluded; use has_school_access/can_view_audit only for support-safe metadata and audit reading.';
comment on function app_private.can_read_staff_identity(uuid) is
'Raw staff identity visibility: Platform Admin, the staff member themself, or users sharing an actual school membership relationship. Generic Platform Support metadata scope is insufficient.';
comment on policy "authenticated school actors record scoped audit events" on public.audit_events is
'Prevents generic Platform Support from authoring arbitrary school audit rows while preserving Platform Admin and active school-member audit authorship.';
