begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9300000-0000-4000-8000-000000000001','guardian-import-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9300000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,total_rows,valid_rows,warning_rows,error_rows,created_by_user_id)
values('f9310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','family.xlsx','ready',3,3,0,0,'f9300000-0000-4000-8000-000000000001');

-- Same mother appears for two siblings; the first learner also has a second guardian.
insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues) values
('f9320000-0000-4000-8000-000000000001','f9310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}','{"learner_admission_number":"DEMO-001","identity_number":"MOTHER-800101","first_names":"Anna","initials":"A","surname":"Family","relationship_type":"mother","email":"anna@example.test","mobile":"","whatsapp":"","is_legal_guardian":true,"is_emergency_contact":true,"is_pickup_authorized":true,"priority":1}','create','[]'),
('f9320000-0000-4000-8000-000000000002','f9310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',3,'{}','{"learner_admission_number":"DEMO-002","identity_number":"MOTHER-800101","first_names":"Anna","initials":"A","surname":"Family","relationship_type":"mother","email":"anna@example.test","mobile":"","whatsapp":"","is_legal_guardian":true,"is_emergency_contact":true,"is_pickup_authorized":true,"priority":1}','create','[]'),
('f9320000-0000-4000-8000-000000000003','f9310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',4,'{}','{"learner_admission_number":"DEMO-001","identity_number":"UNCLE-700101","first_names":"Peter","initials":"P","surname":"Family","relationship_type":"uncle","email":"","mobile":"","whatsapp":"","is_legal_guardian":false,"is_emergency_contact":true,"is_pickup_authorized":true,"priority":2}','create','[]');

select lives_ok(
  $$select public.commit_guardian_import_batch('f9310000-0000-4000-8000-000000000001')$$,
  'guardian import commits when one guardian is repeated across multiple learners'
);
select is((select count(*)::integer from public.guardian_profiles where identity_number='MOTHER-800101'),1,'repeated guardian identity creates one guardian profile');
select is((select count(*)::integer from public.learner_guardians lg join public.guardian_profiles gp on gp.id=lg.guardian_id where gp.identity_number='MOTHER-800101'),2,'one guardian can link to two learners');
select is((select count(*)::integer from public.learner_guardians where learner_id='50000000-0000-4000-8000-000000000001'),2,'one learner can link to multiple guardians');
select is((select initials from public.guardian_profiles where identity_number='MOTHER-800101'),'A','guardian initials survive the many-to-many import');
select is((select status from public.import_batches where id='f9310000-0000-4000-8000-000000000001'),'completed','many-to-many guardian batch completes normally');
select is((select count(*)::integer from public.import_commit_results where batch_id='f9310000-0000-4000-8000-000000000001'),3,'each guardian relationship row receives a commit result');

select * from finish();
rollback;
