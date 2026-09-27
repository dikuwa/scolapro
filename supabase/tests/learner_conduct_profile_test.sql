begin;
select no_plan();

insert into auth.users(id,email,aud,role) values
('d4000000-0000-4000-8000-000000000001','conduct-profile-principal@example.test','authenticated','authenticated'),
('d4000000-0000-4000-8000-000000000002','conduct-profile-outsider@example.test','authenticated','authenticated');
insert into public.tenants(id,name,slug) values
('d4100000-0000-4000-8000-000000000001','Conduct Profile Tenant','conduct-profile');
insert into public.schools(id,tenant_id,name,status) values
('d4200000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','Conduct Profile School','active');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','principal',current_date-10);
insert into public.learners(id,tenant_id,first_names,surname) values
('d4300000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','Profile','Learner');
insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on) values
('d4400000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001',2026,'active','2026-01-01','2026-12-15');
insert into public.academic_terms(tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status) values
('d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4400000-0000-4000-8000-000000000001',1,'Term 1','2026-01-01','2026-04-30','closed'),
('d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4400000-0000-4000-8000-000000000001',2,'Term 2','2026-05-01','2026-08-31','closed'),
('d4100000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4400000-0000-4000-8000-000000000001',3,'Term 3','2026-09-01','2026-12-15','active');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.ensure_conduct_starter_policy('d4200000-0000-4000-8000-000000000001')$$,'starter policy available');
select lives_ok($$select public.record_conduct_policy_item_group('d4200000-0000-4000-8000-000000000001',(select id from public.conduct_policy_categories where school_id='d4200000-0000-4000-8000-000000000001' and code='REC_GEN_05'),'recognition','2026-03-10',null,array['d4300000-0000-4000-8000-000000000001']::uuid[])$$,'term 1 recognition recorded');
select lives_ok($$select public.record_conduct_policy_item_group('d4200000-0000-4000-8000-000000000001',(select id from public.conduct_policy_categories where school_id='d4200000-0000-4000-8000-000000000001' and code='VIO_L1_07'),'violation','2026-06-10',null,array['d4300000-0000-4000-8000-000000000001']::uuid[])$$,'term 2 violation recorded');
select lives_ok($$select public.record_conduct_policy_item_group('d4200000-0000-4000-8000-000000000001',(select id from public.conduct_policy_categories where school_id='d4200000-0000-4000-8000-000000000001' and code='REC_ACA_02'),'recognition','2026-09-10','Strong effort',array['d4300000-0000-4000-8000-000000000001']::uuid[])$$,'term 3 recognition recorded');

select is((public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)#>>'{summary,recognition_count}')::integer,2,'profile totals recognitions');
select is((public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)#>>'{summary,violation_count}')::integer,1,'profile totals violations');
select is((public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)#>>'{summary,net_points}')::integer,5,'profile totals net points without classifying learner');
select is(jsonb_array_length(public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)->'terms'),3,'profile uses configured three terms');
select is((public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)#>>'{terms,0,recognition_count}')::integer,1,'term 1 comparison uses governed dates');
select is(jsonb_array_length(public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)->'timeline'),3,'timeline returns auditable events');

select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_learner_conduct_profile('d4200000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',2026,0)$$,'42501','Permission denied','unauthorized actor cannot open learner conduct profile');

reset role;
select * from finish();
rollback;
