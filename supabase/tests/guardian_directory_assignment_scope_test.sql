begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f6000000-0000-4000-8000-000000000001','assigned-class-teacher@example.test','authenticated','authenticated',now(),now()),
  ('f6000000-0000-4000-8000-000000000002','guardian-scope-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('f6100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f6000000-0000-4000-8000-000000000001','CT-SCOPE-001','Assigned','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6000000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6000000-0000-4000-8000-000000000002',null,'school_admin',current_date);

update public.register_classes
set register_teacher_staff_id='f6100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('f6200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Own Class','Guardian','GUARD-SCOPE-001'),
  ('f6200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other Class','Guardian','GUARD-SCOPE-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values
  ('f6300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','f6200000-0000-4000-8000-000000000001','guardian',1,current_date-10),
  ('f6300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','f6200000-0000-4000-8000-000000000002','guardian',1,current_date-10);

select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  app_private.can_read_guardian('f6200000-0000-4000-8000-000000000001'),
  true,
  'assigned register teacher can read guardian contact context for own class learner'
);

select is(
  app_private.can_read_guardian('f6200000-0000-4000-8000-000000000002'),
  false,
  'class teacher cannot browse guardian records for another class'
);

select is(
  app_private.can_manage_guardians_for_learner('50000000-0000-4000-8000-000000000001'),
  false,
  'class teacher assigned access does not grant direct authoritative guardian editing'
);

select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000002',true);

select is(
  app_private.can_manage_guardians_for_learner('50000000-0000-4000-8000-000000000001'),
  true,
  'school administration retains authoritative guardian management'
);

select is(
  app_private.can_read_guardian('f6200000-0000-4000-8000-000000000002'),
  true,
  'school administration can locate guardians across the school for operational communication'
);

select * from finish();
rollback;