-- Complete FK coverage for effective-dated staff school assignments.

create index if not exists staff_school_assignments_tenant_idx
  on public.staff_school_assignments(tenant_id);

create index if not exists staff_school_assignments_created_by_idx
  on public.staff_school_assignments(created_by_user_id);
