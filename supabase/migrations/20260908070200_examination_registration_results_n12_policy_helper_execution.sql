-- N12 RLS policy execution boundary.
--
-- PostgreSQL evaluates policy expressions as the authenticated caller, so the
-- strict N12 policy helper requires EXECUTE for that role. The helper itself
-- only returns whether the caller has a current direct school examination-
-- management membership; platform/network-only membership remains excluded.

revoke all on function app_private.can_manage_n12_examinations(uuid)
  from public, anon;
grant execute on function app_private.can_manage_n12_examinations(uuid)
  to authenticated;

comment on function app_private.can_manage_n12_examinations(uuid) is
'N12 individual examination-operation boundary and RLS policy helper. Authenticated callers may evaluate it for policy enforcement, but only current direct school examination-management membership qualifies; platform administration and network membership alone never qualify.';
