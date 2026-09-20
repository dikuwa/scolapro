-- Restore learner-directory access for the deterministic current-school member
-- without requiring a separate staff_school_assignments row.
--
-- The prior learner-directory helper added an effective staff-placement gate.
-- That blocks legitimate current-school administrators whose governed access is
-- represented by school_memberships but whose staff identity has not yet been
-- linked to a current staff_school_assignments row. The staff directory already
-- uses the canonical current-school membership boundary; keep learner-directory
-- scope aligned with that contract.
--
-- Platform Admin retains governed oversight. Platform Support has no implicit
-- school-directory override because neither helper grants it.

create or replace function app_private.can_access_current_school_learner_directory(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_targets_current_school((select auth.uid()),p_school_id)
      and app_private.has_school_membership_scope(p_school_id)
    );
$$;

revoke all on function app_private.can_access_current_school_learner_directory(uuid)
from public,anon;
grant execute on function app_private.can_access_current_school_learner_directory(uuid)
to authenticated;

comment on function app_private.can_access_current_school_learner_directory(uuid) is
'Learner directory scope: Platform Admin or an authenticated member targeting the deterministic current school. Current school membership is authoritative for directory access; a separate staff assignment row is not required. Platform Support has no override.';
