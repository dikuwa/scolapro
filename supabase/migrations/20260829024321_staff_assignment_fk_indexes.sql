-- Complete FK coverage for effective-dated staff school assignments.
-- The live migration history assigned this timestamp before the source-aligned
-- staff assignment foundation. On a fresh database the table may not exist yet,
-- so this historical migration is intentionally guarded; a later ensure-indexes
-- migration creates the same indexes after the staff table exists.

do $$
begin
  if to_regclass('public.staff_school_assignments') is not null then
    execute 'create index if not exists staff_school_assignments_tenant_idx on public.staff_school_assignments(tenant_id)';
    execute 'create index if not exists staff_school_assignments_created_by_idx on public.staff_school_assignments(created_by_user_id)';
  end if;
end;
$$;
