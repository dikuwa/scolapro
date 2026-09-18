-- Absence Reviews reads public.attendance_evidence through the existing
-- "need to know users read attendance evidence" RLS policy. That policy invokes
-- app_private.can_read_attendance_evidence(id) in the authenticated caller
-- context. The helper was intentionally revoked from authenticated when the
-- sensitive-evidence boundary was introduced, which makes the policy itself
-- fail with SQLSTATE 42501 as soon as Absence Reviews evaluates evidence state.
--
-- Restore only the EXECUTE privilege required by the existing policy. The
-- helper remains SECURITY DEFINER and continues to enforce uploader /
-- school-leadership / counsellor / assigned-register-teacher need-to-know
-- semantics. Keep anon/public denied.
grant execute on function app_private.can_read_attendance_evidence(uuid)
  to authenticated;

revoke execute on function app_private.can_read_attendance_evidence(uuid)
  from anon;
