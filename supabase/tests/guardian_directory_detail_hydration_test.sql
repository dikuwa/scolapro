begin;

select plan(9);

insert into public.schools(id,tenant_id,name)
values('f6291000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Guardian Hydration Other School');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f6292000-0000-4000-8000-000000000001','guardian-hydration-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6292000-0000-4000-8000-000000000002','guardian-hydration-class@example.test','authenticated','authenticated',now(),now()),
  ('f6292000-0000-4000-8000-000000000003','guardian-hydration-hod@example.test','authenticated','authenticated',now(),now()),
  ('f6292000-0000-4000-8000-000000000004','guardian-hydration-support@example.test','authenticated','authenticated',now(),now()),
  ('f6292000-0000-4000-8000-000000000005','guardian-hydration-platform-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6292000-0000-4000-8000-000000000006','guardian-hydration-other-school@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('f6293000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f6292000-0000-4000-8000-000000000002','GH-CT-001','Hydration','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from
) values(
  'f6293100-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f6293000-0000-4000-8000-000000000002',
  'teaching','Hydration Teacher',current_date-5
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6292000-0000-4000-8000-000000000001',null,'school_admin',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6292000-0000-4000-8000-000000000002','f6293000-0000-4000-8000-000000000002','class_teacher',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6292000-0000-4000-8000-000000000003',null,'hod',current_date-5),
  ('11111111-1111-4111-8111-111111111111','f6291000-0000-4000-8000-000000000002','f6292000-0000-4000-8000-000000000006',null,'school_admin',current_date-5);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('f6292000-0000-4000-8000-000000000004','platform_support',current_date-5),
  ('f6292000-0000-4000-8000-000000000005','platform_admin',current_date-5);

update public.register_classes
set register_teacher_staff_id='f6293000-0000-4000-8000-000000000002'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number,status) values
  ('f6294000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Own','Guardian','GH-G-001','active'),
  ('f6294000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other','Guardian','GH-G-002','active'),
  ('f6294000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Unlinked','Guardian','GH-G-003','active');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from) values
  ('f6295000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','f6294000-0000-4000-8000-000000000001','guardian',1,current_date-10),
  ('f6295000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','f6294000-0000-4000-8000-000000000002','guardian',1,current_date-10);

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from
) values
  ('f6296000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f6294000-0000-4000-8000-000000000001','mobile','0816290001',true,current_date-10);

insert into public.guardian_addresses(
  id,tenant_id,guardian_id,address_type,address_line_1,town_or_city,is_primary,effective_from
) values
  ('f6297000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f6294000-0000-4000-8000-000000000001','physical','629 Test Street','Swakopmund',true,current_date-10);

select ok(
  has_function_privilege('authenticated','public.get_guardian_directory_details(uuid,uuid[])','EXECUTE')
  and not has_function_privilege('anon','public.get_guardian_directory_details(uuid,uuid[])','EXECUTE')
  and not has_function_privilege('public','public.get_guardian_directory_details(uuid,uuid[])','EXECUTE'),
  'detail hydration RPC is available only to authenticated callers'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array[
       'f6294000-0000-4000-8000-000000000001'::uuid,
       'f6294000-0000-4000-8000-000000000002'::uuid,
       'f6294000-0000-4000-8000-000000000003'::uuid
     ])),
  2,
  'school admin receives only linked current-school guardians'
);

select is(
  (select jsonb_array_length(contacts)
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array['f6294000-0000-4000-8000-000000000001'::uuid]
   )),
  1,
  'effective guardian contacts are hydrated'
);

select is(
  (select jsonb_array_length(addresses)
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array['f6294000-0000-4000-8000-000000000001'::uuid]
   )),
  1,
  'effective guardian addresses are hydrated'
);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array[
       'f6294000-0000-4000-8000-000000000001'::uuid,
       'f6294000-0000-4000-8000-000000000002'::uuid
     ])),
  1,
  'class teacher receives only own learner guardian scope'
);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array[
       'f6294000-0000-4000-8000-000000000001'::uuid,
       'f6294000-0000-4000-8000-000000000002'::uuid
     ])),
  2,
  'HOD retains school-wide operational guardian visibility'
);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array['f6294000-0000-4000-8000-000000000001'::uuid]
   )),
  0,
  'Platform Support remains denied guardian directory hydration'
);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000005',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array[
       'f6294000-0000-4000-8000-000000000001'::uuid,
       'f6294000-0000-4000-8000-000000000002'::uuid
     ])),
  2,
  'governed Platform Admin retains directory hydration access'
);

select set_config('request.jwt.claim.sub','f6292000-0000-4000-8000-000000000006',true);
select is(
  (select count(*)::integer
   from public.get_guardian_directory_details(
     '22222222-2222-4222-8222-222222222222',
     array['f6294000-0000-4000-8000-000000000001'::uuid]
   )),
  0,
  'non-current school cannot hydrate guardians from another school'
);

reset role;
select * from finish();
rollback;
