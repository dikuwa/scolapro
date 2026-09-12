begin;

select plan(8);

insert into public.tenants(id,name,slug) values
('fac10000-0000-4000-8000-000000000001','Admissions Current Scope','admissions-current-scope');

insert into public.schools(id,tenant_id,name) values
('fac20000-0000-4000-8000-000000000001','fac10000-0000-4000-8000-000000000001','Admissions A'),
('fac20000-0000-4000-8000-000000000002','fac10000-0000-4000-8000-000000000001','Admissions B');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fac00000-0000-4000-8000-000000000001','multi-admissions@example.test','authenticated','authenticated',now(),now()),
('fac00000-0000-4000-8000-000000000002','stale-admissions@example.test','authenticated','authenticated',now(),now()),
('fac00000-0000-4000-8000-000000000003','support-admissions@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fac30000-0000-4000-8000-000000000002','fac10000-0000-4000-8000-000000000001','fac00000-0000-4000-8000-000000000002','ADM-STALE','Stale','Reviewer','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001','fac00000-0000-4000-8000-000000000001',null,'school_admin',current_date-10),
('fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000002','fac00000-0000-4000-8000-000000000001',null,'school_admin',current_date-1),
('fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001','fac00000-0000-4000-8000-000000000002','fac30000-0000-4000-8000-000000000002','school_admin',current_date-30);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
('fac31000-0000-4000-8000-000000000002','fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001','fac30000-0000-4000-8000-000000000002','management',current_date-30,current_date-1,'fac00000-0000-4000-8000-000000000002');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fac00000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
('fac40000-0000-4000-8000-000000000001','fac10000-0000-4000-8000-000000000001','Transfer','Learner');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('fac41000-0000-4000-8000-000000000001','fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001','fac40000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.admission_applications(id,tenant_id,school_id,academic_year,applicant_first_names,applicant_surname,status) values
('fac50000-0000-4000-8000-000000000001','fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001',2026,'Old','School','received'),
('fac50000-0000-4000-8000-000000000002','fac10000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000002',2026,'Current','School','received');

insert into public.transfer_events(id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_school_id,status,initiated_by_user_id,requested_on) values
('fac60000-0000-4000-8000-000000000001','fac10000-0000-4000-8000-000000000001','fac40000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000001','fac41000-0000-4000-8000-000000000001','fac20000-0000-4000-8000-000000000002','requested','fac00000-0000-4000-8000-000000000001',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fac00000-0000-4000-8000-000000000001',true);
select is(app_private.can_manage_enrolment_workflow('fac20000-0000-4000-8000-000000000001'),false,'older active non-current school cannot be targeted');
select is(app_private.can_manage_enrolment_workflow('fac20000-0000-4000-8000-000000000002'),true,'newest active membership is the current admissions school');
select throws_ok($$select public.decide_admission_application('fac50000-0000-4000-8000-000000000001','accepted',null)$$,'Permission denied','non-current school admission decision is denied');
select throws_ok($$select public.approve_learner_transfer('fac60000-0000-4000-8000-000000000001',current_date,null)$$,'Permission denied','non-current source-school transfer approval is denied');
select lives_ok($$select public.decide_admission_application('fac50000-0000-4000-8000-000000000002','accepted',null)$$,'current-school admission decision succeeds');

select set_config('request.jwt.claim.sub','fac00000-0000-4000-8000-000000000002',true);
select is(app_private.can_manage_enrolment_workflow('fac20000-0000-4000-8000-000000000001'),false,'ended staff placement cannot review admissions');
select throws_ok($$select public.decide_admission_application('fac50000-0000-4000-8000-000000000001','accepted',null)$$,'Permission denied','stale staff placement cannot decide admission');

select set_config('request.jwt.claim.sub','fac00000-0000-4000-8000-000000000003',true);
select is(app_private.can_manage_enrolment_workflow('fac20000-0000-4000-8000-000000000001'),false,'platform support has no school operational admission authority');

select * from finish();
rollback;
