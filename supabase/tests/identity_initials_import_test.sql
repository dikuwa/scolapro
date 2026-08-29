begin;

select plan(7);

select has_column('public','learners','initials','learners store initials separately');
select has_column('public','staff_members','initials','staff store initials separately');
select has_column('public','guardian_profiles','initials','guardians store initials separately');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9100000-0000-4000-8000-000000000001','initials-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','INIT-01','Martin','Mukoya','active');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('f9120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Anna','Adams','INIT-GUARDIAN-01');

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','initials.xlsx','review','f9100000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,matched_entity_type,matched_entity_id,issues) values
('f9140000-0000-4000-8000-000000000001','f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}','{"initials":"jmw"}','link','learner','50000000-0000-4000-8000-000000000001','[]'),
('f9140000-0000-4000-8000-000000000002','f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',3,'{}','{"initials":"mk"}','link','staff_member','f9110000-0000-4000-8000-000000000001','[]'),
('f9140000-0000-4000-8000-000000000003','f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',4,'{}','{"initials":"a"}','link','guardian','f9120000-0000-4000-8000-000000000001','[]');

select is((select initials from public.learners where id='50000000-0000-4000-8000-000000000001'),'JMW','learner initials are normalized and stored separately');
select is((select initials from public.staff_members where id='f9110000-0000-4000-8000-000000000001'),'MK','staff initials are normalized and stored separately');
select is((select initials from public.guardian_profiles where id='f9120000-0000-4000-8000-000000000001'),'A','guardian initials are normalized and stored separately');
select is((select first_names from public.learners where id='50000000-0000-4000-8000-000000000001'),'Amara N.','import initials do not get concatenated into learner first names');

select * from finish();
rollback;
