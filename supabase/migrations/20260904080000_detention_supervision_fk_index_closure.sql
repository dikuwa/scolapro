-- Close the two remaining uncovered foreign-key lookup paths on the detention
-- supervision duty-team table. Existing session/staff composite indexes remain
-- authoritative for operational lookups; these narrow indexes support FK checks,
-- actor-oriented audit queries and tenant-scoped maintenance without changing
-- any detention lifecycle semantics.

create index if not exists detention_session_supervisors_assigned_by_user_idx
  on public.detention_session_supervisors(assigned_by_user_id);

create index if not exists detention_session_supervisors_tenant_idx
  on public.detention_session_supervisors(tenant_id);
