begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc8a0000-0000-4000-8000-000000000001','subject-scope-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fc8a0000-0000-4000-8000-000000000002','subject-scope-admin@example.test','authenticated','authenticated',now(),now()),
  ('fc8a0000-0000-4000-8000-000000000003','subject-scope-librarian@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fc8a1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc8a0000-0000-4000-8000-000000000001','SUB-SCOPE-T','Scoped','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc8a0000-0000-4000-8000-000000000001','fc8a1000-0000-4000-8000-000000000001','teacher',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc8a0000-0000-4000-8000-000000000002',null,'school_admin',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc8a0000-0000-4000-8000-000000000003',null,'librarian',current_date-5);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fc8a2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUB-SCOPE','Subject Scope','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fc8a3000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc8a2000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');
insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
  ('fc8a4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc8a3000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fc8a1000-0000-4000-8000-000000000001',current_date-5);

insert into public.learner_subject_registrations(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id,registered_at
) values
  ('fc8a5000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fc8a3000-0000-4000-8000-000000000001','active','qa','fc8a0000-0000-4000-8000-000000000002',now()),
  ('fc8a5000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','fc8a3000-0000-4000-8000-000000000001','active','qa','fc8a0000-0000-4000-8000-000000000002',now());

select ok(
  has_function_privilege('authenticated','app_private.can_read_learner_subject_registration(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.can_read_learner_subject_registration(uuid,uuid,uuid)','EXECUTE'),
  'narrow RLS predicate is executable only by authenticated clients'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_subject_registrations' and policyname='scoped academic staff read learner subject registrations'),
  1,
  'assignment-aware subject-registration read policy is installed'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc8a0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_subject_registrations where id in ('fc8a5000-0000-4000-8000-000000000001','fc8a5000-0000-4000-8000-000000000002')),1,'teacher sees only registrations in the exact allocated subject/class');
select is((select id from public.learner_subject_registrations where id in ('fc8a5000-0000-4000-8000-000000000001','fc8a5000-0000-4000-8000-000000000002')),'fc8a5000-0000-4000-8000-000000000001'::uuid,'teacher sees the registration for the learner in the allocated class');
reset role;

select set_config('request.jwt.claim.sub','fc8a0000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_subject_registrations where id in ('fc8a5000-0000-4000-8000-000000000001','fc8a5000-0000-4000-8000-000000000002')),0,'non-academic school members do not receive school-wide learner subject-choice visibility');
reset role;

select set_config('request.jwt.claim.sub','fc8a0000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_subject_registrations where id in ('fc8a5000-0000-4000-8000-000000000001','fc8a5000-0000-4000-8000-000000000002')),2,'school administrator retains school-wide subject-registration oversight');
reset role;

select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_subject_registrations' and policyname='school members can read learner subject registrations'),
  0,
  'legacy school-wide read policy is removed'
);

select * from finish();
rollback;