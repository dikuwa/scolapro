begin;

select plan(2);

select ok(
  to_regclass('public.import_batches_school_tenant_idx') is not null,
  'import batch school/tenant composite FK is indexed'
);

select ok(
  to_regclass('public.import_rows_batch_scope_idx') is not null,
  'import row batch/tenant/school composite FK is indexed'
);

select * from finish();
rollback;
