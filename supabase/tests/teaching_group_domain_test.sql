begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('aa000000-0000-4000-8000-000000000001','teaching-group-admin@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;
insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('ab100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Teaching Group School A','TG-A','Erongo','Walvis Bay','active'),
  ('ab100000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Teaching Group School B','TG-B','Erongo','Swakopmund','active');
insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('ab200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','school_admin',current_date-30);
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
  ('ab300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001','TG-SCI','Teaching Group Science');
insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
  ('ab400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'TG10','Grade 10');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id) values
  ('ab500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'ab300000-0000-4000-8000-000000000001','ab400000-0000-4000-8000-000000000001');
insert into public.learners(id,tenant_id,first_names,surname) values
  ('ab600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Teaching','Learner');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status) values
  ('ab700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000001',2026,'ab400000-0000-4000-8000-000000000001',current_date-30,'current');
insert into public.learner_subject_registrations(id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id) values
  ('ab800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'ab700000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000001','ab500000-0000-4000-8000-000000000001','active','test','aa000000-0000-4000-8000-000000000001');
set local session_replication_role = origin;

select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$insert into public.teaching_groups(tenant_id,school_id,academic_year,subject_offering_id,code,name,effective_from)
    values('11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'ab500000-0000-4000-8000-000000000001','TG-A-SCI','Science cohort',current_date-30)$$,
  'same-school Teaching Group insert succeeds'
);

select throws_ok(
  $$insert into public.teaching_group_memberships(tenant_id,school_id,academic_year,teaching_group_id,enrolment_id,learner_id,effective_from,source)
    values('11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'e9000000-0000-4000-8000-000000000001','ab700000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000001',current_date-30,'test')$$,
  'Teaching group membership scope mismatch',
  'membership for an unknown or wrong group is denied before the historical group exists'
);

select throws_ok(
  $$insert into public.teaching_groups(tenant_id,school_id,academic_year,subject_offering_id,code,name,effective_from)
    values('11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000002',2026,'ab500000-0000-4000-8000-000000000001','TG-B-SCI','Cross school',current_date)$$,
  'Teaching group scope does not match school and subject offering',
  'cross-school group is denied'
);

select throws_ok(
  $$insert into public.teaching_groups(tenant_id,school_id,academic_year,subject_offering_id,code,name,effective_from)
    values('22222222-2222-4222-8222-222222222222','ab100000-0000-4000-8000-000000000001',2026,'ab500000-0000-4000-8000-000000000001','TG-TENANT','Cross tenant',current_date)$$,
  'Teaching group scope does not match school and subject offering',
  'cross-tenant group is denied'
);

select throws_ok(
  $$insert into public.teaching_group_memberships(tenant_id,school_id,academic_year,teaching_group_id,enrolment_id,learner_id,effective_from,source)
    values('11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'e9000000-0000-0000-0000-000000000001','ab700000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000001',current_date,'invalid')$$,
  'Teaching group membership scope mismatch',
  'membership for an unknown or wrong group is denied'
);

set local session_replication_role = replica;
insert into public.teaching_groups(id,tenant_id,school_id,academic_year,subject_offering_id,code,name,status,effective_from,effective_to)
values('e9000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'ab500000-0000-4000-8000-000000000001','TG-HIST','Historical cohort','active',current_date-30,current_date-1);
insert into public.teaching_group_memberships(tenant_id,school_id,academic_year,teaching_group_id,enrolment_id,learner_id,effective_from,effective_to,source)
values('11111111-1111-4111-8111-111111111111','ab100000-0000-4000-8000-000000000001',2026,'e9000000-0000-4000-8000-000000000001','ab700000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000001',current_date-30,current_date-1,'history');
set local session_replication_role = origin;

select is((select count(*)::integer from public.resolve_teaching_groups('ab100000-0000-4000-8000-000000000001',2026)),1,'ended group is excluded from current resolver');
select is((select count(*)::integer from public.resolve_teaching_group_members('e9000000-0000-4000-8000-000000000001',current_date-2)),1,'historical membership remains interpretable');
select is((select count(*)::integer from public.resolve_teaching_group_members('e9000000-0000-4000-8000-000000000001',current_date)),0,'ended membership is excluded at current date');

select * from finish();
rollback;
