begin;

select plan(7);

select ok(to_regprocedure('public.reconcile_academic_structure_import_batch(uuid)') is not null,'academic structure import reconciliation exists');
select ok(not has_function_privilege('anon','public.reconcile_academic_structure_import_batch(uuid)','EXECUTE'),'anonymous users cannot reconcile academic structure imports');
select ok(to_regprocedure('public.commit_academic_structure_import_batch(uuid)') is not null,'academic structure import commit exists');
select ok(not has_function_privilege('anon','public.commit_academic_structure_import_batch(uuid)','EXECUTE'),'anonymous users cannot commit academic structure imports');
select ok(to_regprocedure('public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid)') is not null,'teacher allocation RPC exists');
select ok(not has_function_privilege('anon','public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid)','EXECUTE'),'anonymous users cannot create teacher allocations');
select ok(to_regprocedure('public.accept_school_invitation(text)') is not null,'invitation acceptance remains available after staff identity alignment');

select * from finish();
rollback;
