begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('52630000-0000-4000-8000-000000000001','staff-import-current@example.test','authenticated','authenticated',now(),now()),
('52630000-0000-4000-8000-000000000002','staff-import-old@example.test','authenticated','authenticated',now(),now()),
('52630000-0000-4000-8000-000000000003','staff-import-stale@example.test','authenticated','authenticated',now(),now()),
('52630000-0000-4000-8000-000000000004','staff-import-support@example.test','authenticated','authenticated',now(),now()),
('52630000-0000-4000-8000-000000000005','staff-import-platform@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('52620000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Staff QA Later School','STAFF-QA-LATER','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('52640000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52630000-0000-4000-8000-000000000003','STAFF-QA-STALE','Stale','Admin','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
('52650000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','52640000-0000-4000-8000-000000000001','management',current_date-30,current_date-1,'52630000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','52630000-0000-4000-8000-000000000001',null,'school_admin',current_date-10),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','52630000-0000-4000-8000-000000000002',null,'school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','52620000-0000-4000-8000-000000000001','52630000-0000-4000-8000-000000000002',null,'teacher',current_date-1),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','52630000-0000-4000-8000-000000000003','52640000-0000-4000-8000-000000000001','school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','52630000-0000-4000-8000-000000000004',null,'school_admin',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from) values
('52630000-0000-4000-8000-000000000004','platform_support',current_date-10),
('52630000-0000-4000-8000-000000000005','platform_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','52630000-0000-4000-8000-000000000001',true);
set local role authenticated;
select ok(app_private.can_manage_school_imports('22222222-2222-4222-8222-222222222222'),'current-school admin can manage imports');
reset role;

select set_config('request.jwt.claim.sub','52630000-0000-4000-8000-000000000002',true);
set local role authenticated;
select ok(not app_private.can_manage_school_imports('22222222-2222-4222-8222-222222222222'),'older non-current school membership cannot manage imports');
reset role;

select set_config('request.jwt.claim.sub','52630000-0000-4000-8000-000000000003',true);
set local role authenticated;
select ok(not app_private.can_manage_school_imports('22222222-2222-4222-8222-222222222222'),'ended linked staff placement defeats stale admin membership');
reset role;

select set_config('request.jwt.claim.sub','52630000-0000-4000-8000-000000000004',true);
set local role authenticated;
select ok(not app_private.can_manage_school_imports('22222222-2222-4222-8222-222222222222'),'Platform Support remains outside staff/import authority');
reset role;

select set_config('request.jwt.claim.sub','52630000-0000-4000-8000-000000000005',true);
set local role authenticated;
select ok(app_private.can_manage_school_imports('22222222-2222-4222-8222-222222222222'),'Platform Admin retains governed cross-school import authority');
reset role;

select ok(not has_function_privilege('anon','app_private.can_manage_school_imports(uuid)','EXECUTE'),'anonymous cannot execute import authority helper');
select ok(has_function_privilege('authenticated','app_private.can_manage_school_imports(uuid)','EXECUTE'),'authenticated callers retain helper execution for RLS/RPC policies');
select ok(to_regprocedure('public.reconcile_staff_import_batch(uuid)') is not null and to_regprocedure('public.commit_staff_import_batch(uuid)') is not null,'canonical staff reconciliation/commit RPCs remain in place');

select * from finish();
rollback;
