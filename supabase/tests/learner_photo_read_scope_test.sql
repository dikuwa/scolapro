begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fb000000-0000-4000-8000-000000000001','photo-scope-teacher@example.test','authenticated','authenticated',now(),now()),
('fb000000-0000-4000-8000-000000000002','photo-scope-librarian@example.test','authenticated','authenticated',now(),now()),
('fb000000-0000-4000-8000-000000000003','photo-scope-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','PHOTO-T1','Photo','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','class_teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000002',null,'librarian',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000003',null,'school_admin',current_date);

update public.register_classes set register_teacher_staff_id='fb100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into storage.objects(bucket_id,name)
values
('learner-photos','22222222-2222-4222-8222-222222222222/50000000-0000-4000-8000-000000000001/assigned.jpg'),
('learner-photos','22222222-2222-4222-8222-222222222222/50000000-0000-4000-8000-000000000002/other.jpg');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is((select count(*)::integer from storage.objects where bucket_id='learner-photos'),1,'assigned class teacher sees only photo objects for learners in assigned scope');
select is((select count(*)::integer from storage.objects where name like '%50000000-0000-4000-8000-000000000002/%'),0,'teacher cannot read another class learner photo object');

reset role;
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='learner-photos'),0,'librarian minimal learner lookup does not imply learner photo access');

reset role;
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='learner-photos'),2,'school administration retains school-wide learner photo access');
select is(app_private.can_access_learner_photo_object('not-a-uuid/not-a-learner/file.jpg'),false,'malformed photo paths are denied safely');

reset role;
select * from finish();
rollback;
