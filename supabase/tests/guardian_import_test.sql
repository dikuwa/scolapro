begin;

select plan(4);

select ok(to_regprocedure('public.reconcile_guardian_import_batch(uuid)') is not null,'guardian import reconciliation exists');
select ok(not has_function_privilege('anon','public.reconcile_guardian_import_batch(uuid)','EXECUTE'),'anonymous users cannot reconcile guardian imports');
select ok(to_regprocedure('public.commit_guardian_import_batch(uuid)') is not null,'guardian import commit exists');
select ok(not has_function_privilege('anon','public.commit_guardian_import_batch(uuid)','EXECUTE'),'anonymous users cannot commit guardian imports');

select * from finish();
rollback;
