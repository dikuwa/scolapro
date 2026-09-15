-- The guardian-absence SELECT policies call this private authorization helper in
-- the authenticated caller context. Its EXECUTE privilege was revoked from
-- authenticated, causing every staff Absence Reviews notice read to fail with
-- SQLSTATE 42501 before the policy could evaluate its existing authorization.
-- Restore only the privilege required by those existing policies; keep anon/public
-- denied and leave the authorization function and #418 scope semantics unchanged.
grant execute on function app_private.can_review_guardian_absence_notice(uuid)
  to authenticated;

revoke execute on function app_private.can_review_guardian_absence_notice(uuid)
  from anon;