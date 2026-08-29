begin;

select plan(11);

select has_table('public','staff_school_assignments','staff school assignments exist');
select ok((select relrowsecurity from pg_class where oid='public.staff_school_assignments'::regclass),'staff school assignments use RLS');
select ok(to_regprocedure('public.assign_staff_to_school(uuid,uuid,text,text,date,date)') is not null,'staff school assignment RPC exists');
select ok(not has_function_privilege('anon','public.assign_staff_to_school(uuid,uuid,text,text,date,date)','EXECUTE'),'anonymous users cannot assign staff to schools');
select ok(to_regprocedure('public.end_staff_school_assignment(uuid,date)') is not null,'staff school assignment end RPC exists');
select ok(not has_function_privilege('anon','public.end_staff_school_assignment(uuid,date)','EXECUTE'),'anonymous users cannot end staff assignments');
select ok(not has_table_privilege('authenticated','public.staff_school_assignments','INSERT'),'authenticated clients cannot insert staff assignments directly');
select ok(not has_table_privilege('authenticated','public.staff_school_assignments','UPDATE'),'authenticated clients cannot update staff assignments directly');
select ok(to_regprocedure('public.reconcile_staff_import_batch(uuid)') is not null,'staff import reconciliation exists');
select ok(to_regprocedure('public.commit_staff_import_batch(uuid)') is not null,'staff import commit exists');
select ok(not has_function_privilege('anon','public.commit_staff_import_batch(uuid)','EXECUTE'),'anonymous users cannot commit staff imports');

select * from finish();
rollback;
