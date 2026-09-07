-- N20 authorization boundary correction.
-- The school-scoped boolean predicate is intentionally callable by authenticated
-- sessions because N20 RLS policies invoke it in caller context. It returns only
-- whether the current auth.uid() holds a current control-leadership membership;
-- anonymous execution remains denied and all mutation RPCs still re-check it.

grant execute on function app_private.control_leader(uuid) to authenticated;
