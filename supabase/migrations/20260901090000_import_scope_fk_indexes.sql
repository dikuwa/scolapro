-- Cover the composite foreign keys introduced by import scope integrity hardening.
-- Column order matches each foreign-key definition so deletes/updates on parent keys
-- do not require avoidable scans of import tables.

create index if not exists import_batches_school_tenant_idx
  on public.import_batches (school_id, tenant_id);

create index if not exists import_rows_batch_scope_idx
  on public.import_rows (batch_id, tenant_id, school_id);

comment on index public.import_batches_school_tenant_idx is
'Covering index for import_batches_school_tenant_fkey.';

comment on index public.import_rows_batch_scope_idx is
'Covering index for import_rows_batch_scope_fkey.';
