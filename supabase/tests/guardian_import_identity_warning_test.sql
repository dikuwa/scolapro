begin;

select plan(1);

select ok(
  position('different recorded name' in lower(pg_get_functiondef('public.reconcile_guardian_import_batch(uuid)'::regprocedure))) > 0,
  'guardian reconciliation retains an explicit identity/name mismatch review warning'
);

select * from finish();
rollback;
