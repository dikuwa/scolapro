-- N09 RLS policy helper execution boundary.
-- Policies on examination-centre reference tables invoke this private helper while
-- evaluating authenticated callers. Match the established education-network helper
-- pattern: authenticated may execute the bounded boolean helper, anonymous/public may not.

revoke all on function app_private.can_view_examination_centre(uuid, date)
  from public, anon;
grant execute on function app_private.can_view_examination_centre(uuid, date)
  to authenticated;
