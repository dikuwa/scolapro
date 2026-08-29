-- Fresh-database companion for the historically early live FK-index migration.
-- At this point in source order the staff assignment table is guaranteed to exist.

create index if not exists staff_school_assignments_tenant_idx
  on public.staff_school_assignments(tenant_id);

create index if not exists staff_school_assignments_created_by_idx
  on public.staff_school_assignments(created_by_user_id);
