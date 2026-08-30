begin;

select plan(22);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('ec000000-0000-4000-8000-000000000001','sports-admin@example.test','authenticated','authenticated',now(),now()),
 ('ec000000-0000-4000-8000-000000000002','sports-reader@example.test','authenticated','authenticated',now(),now()),
 ('ec000000-0000-4000-8000-000000000003','sports-other-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec000000-0000-4000-8000-000000000001','school_admin',current_date),
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec000000-0000-4000-8000-000000000002','teacher',current_date);
insert into public.schools(id,tenant_id,name,status) values
 ('ec010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sports Other School','active');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
 ('11111111-1111-4111-8111-111111111111','ec010000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000003','school_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000001',true);

select lives_ok(
 $$select public.upsert_sports_house('22222222-2222-4222-8222-222222222222','Eagles','EAG','#FFFFFF',1,null)$$,
 'school administrator creates a house through governed RPC'
);
select lives_ok(
 $$select public.upsert_sports_house('22222222-2222-4222-8222-222222222222','Sharks','SHA','#808080',2,null)$$,
 'school administrator may configure multiple houses'
);
select lives_ok(
 $$select public.upsert_sports_house('22222222-2222-4222-8222-222222222222','Cheetah','CHE','#F97316',3,null)$$,
 'house names and colours remain school data'
);
select is((select count(*)::integer from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222'),3,'school has its configured house count');
select is((select color_hex from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Cheetah'),'#F97316','configured colour is preserved');

select lives_ok(
 $$select public.set_sports_year_settings('22222222-2222-4222-8222-222222222222',2026,'2026-12-31','carry_forward',true,true,false)$$,
 'school configures explicit annual sports age reference date and continuity'
);
select lives_ok(
 $$select public.upsert_sports_age_group('22222222-2222-4222-8222-222222222222','Age 13',13,13,1,null)$$,
 'first school-defined age band is accepted'
);
select lives_ok(
 $$select public.upsert_sports_age_group('22222222-2222-4222-8222-222222222222','Age 14',14,14,2,null)$$,
 'second non-overlapping age band is accepted'
);
select throws_ok(
 $$select public.upsert_sports_age_group('22222222-2222-4222-8222-222222222222','Overlap',13,14,3,null)$$,
 'Active sports age groups may not overlap',
 'overlapping active age bands are rejected instead of resolved by sort order'
);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
 ('ec200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sport','Learner','2012-06-01','female'),
 ('ec200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Unenrolled','Learner','2011-02-01','male');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
 ('ec210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec200000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

select throws_ok(
 $$select public.assign_learner_sports_house('22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000002',(select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Eagles'),'manual',false)$$,
 'Learner must have an enrolment at the school for the sports year',
 'unenrolled learner cannot receive a house assignment'
);
select lives_ok(
 $$select public.assign_learner_sports_house('22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000001',(select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Eagles'),'automatic',false)$$,
 'enrolled learner receives a governed year-scoped house assignment'
);
select is((select age_on_reference_date from public.sports_house_learner_roster where learner_id='ec200000-0000-4000-8000-000000000001'),14,'roster derives age from configured reference date');
select is((select age_group_label from public.sports_house_learner_roster where learner_id='ec200000-0000-4000-8000-000000000001'),'Age 14','roster resolves the non-overlapping school-defined age group');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
 ('ec300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','SPORT-STAFF-1','House','Leader','active'),
 ('ec300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','SPORT-STAFF-2','No','Placement','active');
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
 ('ec310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec300000-0000-4000-8000-000000000001','teacher','2026-01-01','ec000000-0000-4000-8000-000000000001');
select lives_ok(
 $$select public.assign_staff_sports_house('22222222-2222-4222-8222-222222222222',2026,'ec300000-0000-4000-8000-000000000001',(select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Eagles'),'leader','manual',true)$$,
 'placed staff member can become a governed house leader'
);
select throws_ok(
 $$select public.assign_staff_sports_house('22222222-2222-4222-8222-222222222222',2026,'ec300000-0000-4000-8000-000000000002',(select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Sharks'),'member','manual',false)$$,
 'Staff member must have a school placement overlapping the sports year',
 'staff without overlapping school placement cannot receive a house'
);

set local role authenticated;
select throws_ok(
 $$insert into public.sports_houses(tenant_id,school_id,name) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Raw Write')$$,
 '42501',null,'authenticated clients cannot bypass governed sports RPCs with raw insert'
);
reset role;

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.sports_houses),3,'ordinary school member reads only accessible-school sports houses');
select throws_ok(
 $$select public.upsert_sports_house('22222222-2222-4222-8222-222222222222','Teacher Write',null,null,0,null)$$,
 'Permission denied','ordinary teacher cannot mutate sports configuration through RPC'
);
reset role;

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok(
 $$select public.upsert_sports_house('ec010000-0000-4000-8000-000000000001','Other Eagles','OE','#2563EB',1,null)$$,
 'administrator of another school can manage sports configuration in their own school'
);
select is(
 (select count(*)::integer from public.sports_houses),
 1,
 'administrator of another school reads only sports houses from their accessible school'
);
select throws_ok(
 $$select public.upsert_sports_house('22222222-2222-4222-8222-222222222222','Cross-school Write',null,null,0,null)$$,
 'Permission denied',
 'administrator of another school cannot mutate sports configuration in this school'
);
select throws_ok(
 $$select public.assign_learner_sports_house('22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000001',null,'manual',false)$$,
 'Permission denied',
 'administrator of another school cannot assign learners into this school sports workflow'
);
reset role;

select * from finish();
rollback;