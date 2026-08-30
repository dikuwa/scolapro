begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ec000000-0000-4000-8000-000000000001','sports-admin@example.test','authenticated','authenticated',now(),now()),
  ('ec000000-0000-4000-8000-000000000002','sports-reader@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec000000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.schools(id,tenant_id,name,status)
values('ec010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sports Other School','active');

insert into public.sports_houses(id,tenant_id,school_id,name,short_code,color_hex,sort_order,created_by_user_id)
values
  ('ec100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Eagles','EAG','#FFFFFF',1,'ec000000-0000-4000-8000-000000000001'),
  ('ec100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Sharks','SHA','#808080',2,'ec000000-0000-4000-8000-000000000001'),
  ('ec100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Cheetah','CHE','#F97316',3,'ec000000-0000-4000-8000-000000000001'),
  ('ec100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ec010000-0000-4000-8000-000000000001','Other House','OTH','#000000',1,'ec000000-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222'),3,'school may configure its own number of houses');
select is((select color_hex from public.sports_houses where id='ec100000-0000-4000-8000-000000000003'),'#F97316','house colour is school data rather than a system constant');

insert into public.sports_year_settings(id,tenant_id,school_id,academic_year,age_reference_date,assignment_continuity,created_by_user_id)
values('ec110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'2026-12-31','carry_forward','ec000000-0000-4000-8000-000000000001');

insert into public.sports_age_groups(id,tenant_id,school_id,label,min_age,max_age,sort_order,created_by_user_id)
values
  ('ec120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Age 13',13,13,1,'ec000000-0000-4000-8000-000000000001'),
  ('ec120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Age 14',14,14,2,'ec000000-0000-4000-8000-000000000001'),
  ('ec120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Age 15',15,15,3,'ec000000-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.sports_age_groups where school_id='22222222-2222-4222-8222-222222222222'),3,'age groups are configurable per school');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('ec200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sport','Learner','2012-06-01','female'),
  ('ec200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Unenrolled','Learner','2011-02-01','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('ec210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec200000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

select throws_ok(
  $$insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assigned_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001')$$,
  'Learner must have an enrolment at the school for the sports year',
  'unenrolled learner cannot be placed into a school house'
);
select throws_ok(
  $$insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assigned_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000004','ec000000-0000-4000-8000-000000000001')$$,
  'Sports house must belong to the same tenant and school',
  'learner cannot be assigned to another school house'
);

insert into public.sports_learner_house_assignments(id,tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id)
values('ec220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','automatic',false,'ec000000-0000-4000-8000-000000000001');

select is((select house_id from public.sports_learner_house_assignments where learner_id='ec200000-0000-4000-8000-000000000001' and academic_year=2026),'ec100000-0000-4000-8000-000000000001'::uuid,'valid enrolled learner receives one year-scoped house assignment');
select throws_ok(
  $$insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assigned_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000002','ec000000-0000-4000-8000-000000000001')$$,
  '23505',null,'learner cannot belong to two houses in the same school year'
);
select is((select age_on_reference_date from public.sports_house_learner_roster where learner_id='ec200000-0000-4000-8000-000000000001'),14,'roster derives learner age from the configured reference date');
select is((select age_group_label from public.sports_house_learner_roster where learner_id='ec200000-0000-4000-8000-000000000001'),'Age 14','roster resolves the school-defined age group');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('ec300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','SPORT-STAFF-1','House','Leader One','active'),
  ('ec300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','SPORT-STAFF-2','House','Leader Two','active'),
  ('ec300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','SPORT-STAFF-3','No','Placement','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values
  ('ec310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec300000-0000-4000-8000-000000000001','teacher','2026-01-01','ec000000-0000-4000-8000-000000000001'),
  ('ec310000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec300000-0000-4000-8000-000000000002','teacher','2026-01-01','ec000000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.sports_staff_house_assignments(tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assigned_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec300000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000001','member','ec000000-0000-4000-8000-000000000001')$$,
  'Staff member must have a school placement overlapping the sports year',
  'staff without a school placement cannot be assigned to a house'
);

insert into public.sports_staff_house_assignments(id,tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_by_user_id)
values('ec320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec300000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','leader','manual',true,'ec000000-0000-4000-8000-000000000001');

select is((select role_key from public.sports_staff_house_assignments where id='ec320000-0000-4000-8000-000000000001'),'leader','school can assign a staff house leader');
select throws_ok(
  $$insert into public.sports_staff_house_assignments(tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assigned_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','leader','ec000000-0000-4000-8000-000000000001')$$,
  '23505',null,'a house has at most one leader in a school year'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is((select count(*)::integer from public.sports_houses),3,'ordinary school member can read only sports houses in their accessible school');

select * from finish();
rollback;
