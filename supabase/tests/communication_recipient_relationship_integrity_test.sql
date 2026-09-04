begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd100000-0000-4000-8000-000000000001','comm-rel-member@example.test','authenticated','authenticated',now(),now()),
  ('fd100000-0000-4000-8000-000000000002','comm-rel-guardian-a@example.test','authenticated','authenticated',now(),now()),
  ('fd100000-0000-4000-8000-000000000003','comm-rel-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('fd100000-0000-4000-8000-000000000004','comm-rel-guardian-b@example.test','authenticated','authenticated',now(),now()),
  ('fd100000-0000-4000-8000-000000000005','comm-rel-author@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fd110000-0000-4000-8000-000000000001','Communication Relationship Tenant B','communication-relationship-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fd120000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','Communication Relationship School B','COMM-REL-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000005','school_admin',current_date),
  ('fd110000-0000-4000-8000-000000000001','fd120000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000005','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('fd130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Recipient','Learner A','2010-01-01','unspecified'),
  ('fd130000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','Recipient','Learner B','2010-01-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fd140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd130000-0000-4000-8000-000000000001',2026,current_date,'current'),
  ('fd140000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','fd120000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000002',2026,current_date,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values
  ('fd150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian','School A','active'),
  ('fd150000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','Guardian','School B','active');

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values
  ('fd160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd150000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000005'),
  ('fd160000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000004','fd100000-0000-4000-8000-000000000005');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority,effective_from)
values
  ('fd170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd130000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','parent',true,true,true,1,current_date),
  ('fd170000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000002','fd150000-0000-4000-8000-000000000002','parent',true,true,true,1,current_date);

insert into public.communication_messages(id,tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
values
  ('fd180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','app','Relationship A','individual','draft','fd100000-0000-4000-8000-000000000005'),
  ('fd180000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','fd120000-0000-4000-8000-000000000001','app','Relationship B','individual','draft','fd100000-0000-4000-8000-000000000005');

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000003')$$,
  'Communication recipient scope mismatch: user account is not currently related to school',
  'arbitrary app account cannot be attached to a school communication'
);

select lives_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001')$$,
  'active school member remains an eligible app-account recipient'
);

select lives_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000002')$$,
  'guardian account linked to a current learner at the school remains eligible'
);

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000004')$$,
  'Communication recipient scope mismatch: user account is not currently related to school',
  'guardian account for another school cannot be cross-wired into this school communication'
);

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,destination)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000002','external@example.test')$$,
  'Communication recipient scope mismatch: recipient does not match message school',
  'recipient tenant and school must match the parent message even for external destinations'
);

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,destination)
    values('fd110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fd180000-0000-4000-8000-000000000001','external@example.test')$$,
  'Communication recipient scope mismatch: school does not belong to tenant',
  'recipient school must belong to its declared tenant before message validation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_communication_recipient_identity_scope()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_recipient_identity_scope()','EXECUTE'),
  'communication recipient integrity helper remains unavailable to client roles'
);

select * from finish();
rollback;
