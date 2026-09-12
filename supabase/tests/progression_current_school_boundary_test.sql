begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fa900000-0000-4000-8000-000000000001','progression-multi@example.test','authenticated','authenticated',now(),now()),
('fa900000-0000-4000-8000-000000000002','progression-current@example.test','authenticated','authenticated',now(),now()),
('fa900000-0000-4000-8000-000000000003','progression-stale@example.test','authenticated','authenticated',now(),now()),
('fa900000-0000-4000-8000-000000000004','progression-support@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
('fa910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Progression Current School','PROG-CUR','Erongo','Swakopmund');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fa920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa900000-0000-4000-8000-000000000003','PROG-STALE','Stale','Leader','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa900000-0000-4000-8000-000000000001',null,'school_admin',current_date-20),
('11111111-1111-4111-8111-111111111111','fa910000-0000-4000-8000-000000000001','fa900000-0000-4000-8000-000000000001',null,'school_admin',current_date-1),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa900000-0000-4000-8000-000000000002',null,'school_admin',current_date-10),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa900000-0000-4000-8000-000000000003','fa920000-0000-4000-8000-000000000001','principal',current_date-30);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
('fa921000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa920000-0000-4000-8000-000000000001','management',current_date-30,current_date-1,'fa900000-0000-4000-8000-000000000003');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fa900000-0000-4000-8000-000000000004','platform_support',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
('fa930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Progression'),
('fa930000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Historical','Progression');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,enrolled_to,status) values
('fa940000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa930000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010',current_date-100,null,'current'),
('fa940000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa930000-0000-4000-8000-000000000002',2026,'30000000-0000-4000-8000-000000000010',current_date-100,current_date-1,'transferred');

insert into public.promotion_rule_sets(
 id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,
 pass_outcome,fail_outcome,source_reference,effective_from,status,created_by_user_id
) values(
 'fa950000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
 '30000000-0000-4000-8000-000000000010','AUDIT-CURRENT-SCOPE','1',3,'promoted','not_promoted','Authorization regression only',current_date-30,'active','fa900000-0000-4000-8000-000000000002'
);

insert into public.year_end_progressions(
 id,tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,outcome,recommended_outcome,
 rule_set_key,rule_set_version,rationale,status,decided_by_user_id,decided_at
) values(
 'fa960000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'fa930000-0000-4000-8000-000000000001','fa940000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010',
 'not_promoted','not_promoted','AUDIT-CURRENT-SCOPE','1','{}'::jsonb,'reviewed','fa900000-0000-4000-8000-000000000002',now()
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fa900000-0000-4000-8000-000000000001',true);
select throws_ok(
 $$select public.evaluate_promotion_recommendation('fa940000-0000-4000-8000-000000000001','fa950000-0000-4000-8000-000000000001')$$,
 'Permission denied',
 'older still-active non-current school cannot be targeted through promotion evaluation'
);

select set_config('request.jwt.claim.sub','fa900000-0000-4000-8000-000000000002',true);
select lives_ok(
 $$select public.evaluate_promotion_recommendation('fa940000-0000-4000-8000-000000000001','fa950000-0000-4000-8000-000000000001')$$,
 'current-school leader can evaluate a current effective enrolment'
);
select throws_ok(
 $$select public.evaluate_promotion_recommendation('fa940000-0000-4000-8000-000000000002','fa950000-0000-4000-8000-000000000001')$$,
 'Only a current effective enrolment can be evaluated for progression',
 'historical ended enrolment cannot be newly evaluated for progression'
);

set local role authenticated;
select throws_ok(
 $$select public.evaluate_promotion_recommendation_scoped_engine('fa940000-0000-4000-8000-000000000001','fa950000-0000-4000-8000-000000000001')$$,
 'permission denied for function evaluate_promotion_recommendation_scoped_engine',
 'unscoped promotion engine is not directly executable by authenticated clients'
);
reset role;

select set_config('request.jwt.claim.sub','fa900000-0000-4000-8000-000000000003',true);
select is(
 app_private.has_school_local_role('22222222-2222-4222-8222-222222222222',array['school_admin','principal','deputy_principal']),
 false,
 'ended staff placement has no progression approval authority'
);
select throws_ok(
 $$select public.approve_year_end_progression('fa960000-0000-4000-8000-000000000001')$$,
 'Permission denied',
 'stale staff placement cannot approve a reviewed progression'
);

select set_config('request.jwt.claim.sub','fa900000-0000-4000-8000-000000000004',true);
select throws_ok(
 $$select public.evaluate_promotion_recommendation('fa940000-0000-4000-8000-000000000001','fa950000-0000-4000-8000-000000000001')$$,
 'Permission denied',
 'platform support has no school-local promotion evaluation authority'
);

select * from finish();
rollback;
