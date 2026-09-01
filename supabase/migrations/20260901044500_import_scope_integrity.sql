-- Enforce the import scope invariants structurally instead of relying only on
-- SECURITY DEFINER reconciliation/commit functions to interpret duplicated tenant/school keys.
-- Existing staging data was verified clean before this migration was authored.

-- Composite candidate keys let foreign keys carry tenant/school ownership across levels.
alter table public.schools
  add constraint schools_id_tenant_key unique (id, tenant_id);

alter table public.import_batches
  add constraint import_batches_id_tenant_school_key unique (id, tenant_id, school_id);

-- A batch cannot pair a school with another tenant.
alter table public.import_batches
  add constraint import_batches_school_tenant_fkey
  foreign key (school_id, tenant_id)
  references public.schools (id, tenant_id)
  on delete cascade
  not valid;

alter table public.import_batches
  validate constraint import_batches_school_tenant_fkey;

-- A row cannot claim a tenant/school scope different from its parent batch.
alter table public.import_rows
  add constraint import_rows_batch_scope_fkey
  foreign key (batch_id, tenant_id, school_id)
  references public.import_batches (id, tenant_id, school_id)
  on delete cascade
  not valid;

alter table public.import_rows
  validate constraint import_rows_batch_scope_fkey;

comment on constraint import_batches_school_tenant_fkey on public.import_batches is
'Guarantees every import batch tenant_id is the tenant that owns its school_id.';

comment on constraint import_rows_batch_scope_fkey on public.import_rows is
'Guarantees every import row repeats the exact tenant and school scope of its parent import batch.';
