begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc000000-0000-4000-8000-000000000001','identity-teacher@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000002','identity-librarian@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000003','identity-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000001','IDENT-T1','Identity','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','class_teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000002',null,'librarian',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000003',null,'school_admin',current_date);

update public.register_classes set register_teacher_staff_id='fc100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is((select count(*)::integer from public.learners),1,'assigned class teacher sees only the learner in the assigned class through raw learner RLS');
select is((select id from public.learners limit 1),'50000000-0000-4000-8000-000000000001'::uuid,'assigned teacher raw identity row is the assigned learner');

reset role;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is((select count(*)::integer from public.learners),0,'librarian does not receive unrestricted raw learner identity rows');
select is((select count(*)::integer from public.search_operational_learner_directory('22222222-2222-4222-8222-222222222222','',30)),2,'librarian can use the minimal operational learner lookup');

reset role;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is((select count(*)::integer from public.learners),2,'school admin retains school-wide raw learner access');
select is((select count(*)::integer from public.enrolments),2,'school admin retains school-wide enrolment access');

reset role;
select * from finish();
rollback;