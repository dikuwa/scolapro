begin;

select plan(12);

select has_column('public','staff_school_assignments','staff_code','school-scoped staff code exists');
select has_column('public','staff_school_assignments','default_room_id','school-scoped default room exists');
select ok(to_regprocedure('public.configure_staff_school_assignment(uuid,text,uuid)') is not null,'staff configuration uses a governed RPC');
select ok(not has_function_privilege('anon','public.configure_staff_school_assignment(uuid,text,uuid)','EXECUTE'),'anonymous users cannot configure staff assignments');

select ok(to_regprocedure('public.register_examination_candidate(uuid,uuid)') is not null,'candidate registration uses a governed RPC');
select ok(not has_table_privilege('authenticated','public.examination_candidates','INSERT'),'authenticated users cannot insert candidates directly');
select ok(not has_table_privilege('authenticated','public.examination_candidates','UPDATE'),'authenticated users cannot bypass candidate-number history');
select ok(not has_table_privilege('authenticated','public.examination_candidates','DELETE'),'authenticated users cannot delete candidate history directly');

select ok(to_regprocedure('public.register_guardian_absence_attachment(uuid,text,text,text,bigint)') is not null,'absence attachment registration function exists');
select ok(not has_function_privilege('anon','public.register_guardian_absence_attachment(uuid,text,text,text,bigint)','EXECUTE'),'anonymous users cannot register absence attachments');
select has_view('public','late_detention_open_queue','detention open queue view exists');
select has_view('public','late_detention_history','detention history view exists');

select * from finish();
rollback;
