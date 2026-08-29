-- Keep invoice recalculation as an internal helper of governed finance RPCs.
-- `allocate_finance_payment` is SECURITY DEFINER and may call this helper as the
-- function owner; signed-in clients do not need a direct recalculation endpoint.

revoke all on function public.recalculate_finance_invoice(uuid) from public, anon, authenticated;

comment on function public.recalculate_finance_invoice(uuid) is
'Internal finance helper invoked by governed finance workflows. Not directly executable by client roles.';
