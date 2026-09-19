-- Issue #539: profile/data-correction current-scope QA hardening.
--
-- Preserve the existing governed correction workflow while aligning review/read authority
-- with deterministic current-school and effective staff-placement semantics. Platform Admin
-- retains the already-established governed cross-school review capability; Platform Support
-- remains excluded. Historical request and audit facts are not rewritten.

create or replace function app_private.user_can_review_profile_change_request(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      app_private.user_targets_current_school(p_user_id, p_school_id)
      and exists (
        select 1
        from public.school_memberships sm
        where sm.school_id = p_school_id
          and sm.user_id = p_user_id
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,
              p_school_id,
              current_date,
              current_date
            )
          )
      )
    );
$$;

revoke all on function app_private.user_can_review_profile_change_request(uuid,uuid)
from public, anon, authenticated;

create or replace function app_private.can_review_profile_change_request(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $
  select app_private.user_can_review_profile_change_request(
    (select auth.uid()),
    p_school_id
  );
$;

revoke all on function app_private.can_review_profile_change_request(uuid)
from public, anon;
grant execute on function app_private.can_review_profile_change_request(uuid)
to authenticated;

drop policy if exists "requesters and reviewers read profile change requests"
on public.profile_change_requests;
drop policy if exists "current requesters and reviewers read profile change requests"
on public.profile_change_requests;

create policy "current requesters and reviewers read profile change requests"
on public.profile_change_requests
for select
to authenticated
using (
  requested_by_user_id = (select auth.uid())
  or app_private.can_review_profile_change_request(school_id)
);

comment on function app_private.user_can_review_profile_change_request(uuid,uuid) is
'Profile-correction review authority: active Platform Admin, or school leadership in the deterministic current school backed by effective staff placement when the membership is linked to staff. Platform Support is excluded.';

comment on policy "current requesters and reviewers read profile change requests"
on public.profile_change_requests is
'Profile-change requests remain visible to their requester and to governed current reviewers only; older/non-current school memberships and stale linked staff placements do not expose another correction queue.';

comment on function app_private.can_review_profile_change_request(uuid) is
'Authenticated RLS wrapper for governed profile-change review authority; arbitrary-user review evaluation remains private.';
