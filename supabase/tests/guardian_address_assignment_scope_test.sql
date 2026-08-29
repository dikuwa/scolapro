begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ff100000-0000-4000-8000-000000000001','address-scope-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ff100000-0000-4000-8000-000000000002','address-scope-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('ff110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ff100000-0000-4000-8000-000000000001','ADDR-CT-001','Address','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff100000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff100000-0000-4000-8000-000000000002',null,'school_admin',current_date);

update public.register_classes
set register_teacher_staff_id='ff110000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('ff120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Assigned','Guardian','ADDR-G-001'),
  ('ff120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other','Guardian','ADDR-G-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values
  ('ff130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','ff120000-0000-4000-8000-000000000001','guardian',1,current_date-10),
  ('ff130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','ff120000-0000-4000-8000-000000000002','guardian',1,current_date-10);

insert into public.guardian_addresses(id,tenant_id,guardian_id,address_type,address_line_1,town_or_city,is_primary)
values
  ('ff140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ff120000-0000-4000-8000-000000000001','physical','1 Assigned Street','Swakopmund',true),
  ('ff140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ff120000-0000-4000-8000-000000000002','physical','2 Other Street','Swakopmund',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','ff100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(*)::integer from public.guardian_addresses),
  1,
  'assigned class teacher sees only guardian addresses for their assigned learner scope'
);
select is(
  (select count(*)::integer from public.guardian_addresses where guardian_id='ff120000-0000-4000-8000-000000000001'),
  1,
  'assigned learner guardian address remains visible to the register teacher'
);
select is(
  (select count(*)::integer from public.guardian_addresses where guardian_id='ff120000-0000-4000-8000-000000000002'),
  0,
  'class teacher cannot browse another class guardian address'
);

select set_config('request.jwt.claim.sub','ff100000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from public.guardian_addresses),
  2,
  'school administration retains school-wide operational guardian address visibility'
);

select * from finish();
rollback;