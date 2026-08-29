begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f5000000-0000-4000-8000-000000000001','directory-class-teacher@example.test','authenticated','authenticated',now(),now()),
  ('f5000000-0000-4000-8000-000000000002','directory-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('f5100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5000000-0000-4000-8000-000000000001','DIR-CT-001','Directory','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f5000000-0000-4000-8000-000000000001','f5100000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f5000000-0000-4000-8000-000000000002',null,'school_admin',current_date);

update public.register_classes
set register_teacher_staff_id='f5100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('f5200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Alice','Guardian','DIR-GUARD-001'),
  ('f5200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Bob','Guardian','DIR-GUARD-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values
  ('f5300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001','mother',1,current_date-10),
  ('f5300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','f5200000-0000-4000-8000-000000000002','father',1,current_date-10);

insert into public.guardian_contacts(id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from)
values
  ('f5400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5200000-0000-4000-8000-000000000001','mobile','0811111111',true,current_date-10),
  ('f5400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f5200000-0000-4000-8000-000000000002','mobile','0822222222',true,current_date-10);

select set_config('request.jwt.claim.sub','f5000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(*)::integer from public.search_guardian_directory('22222222-2222-4222-8222-222222222222',null,50)),
  1,
  'assigned class teacher directory returns only guardians linked through authorized learners'
);

select is(
  (select guardian_name from public.search_guardian_directory('22222222-2222-4222-8222-222222222222',null,50)),
  'Alice Guardian',
  'assigned class teacher sees own-class guardian identity'
);

select is(
  (select primary_mobile from public.search_guardian_directory('22222222-2222-4222-8222-222222222222','081111',50)),
  '0811111111',
  'directory can locate an authorized guardian by contact number'
);

select is(
  (select count(*)::integer from public.search_guardian_directory('22222222-2222-4222-8222-222222222222','Bob Guardian',50)),
  0,
  'search does not leak an unrelated class guardian by name'
);

select set_config('request.jwt.claim.sub','f5000000-0000-4000-8000-000000000002',true);

select is(
  (select count(*)::integer from public.search_guardian_directory('22222222-2222-4222-8222-222222222222',null,50)),
  2,
  'school administration can search guardians school-wide'
);

select ok(
  (select bool_and(jsonb_array_length(linked_learners)=1) from public.search_guardian_directory('22222222-2222-4222-8222-222222222222',null,50)),
  'directory returns explicit linked learner context for each guardian result'
);

select * from finish();
rollback;