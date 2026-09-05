begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc000000-0000-4000-8000-000000000001','evidence-uploader@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000002','evidence-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000003','evidence-librarian@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000004','evidence-class@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000005','evidence-principal@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000004','EVID-CLASS-001','Evidence','Class Teacher','active');

update public.register_classes
set register_teacher_staff_id='fc100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001',null,'teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000002',null,'teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000003',null,'librarian',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000004','fc100000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000005',null,'principal',current_date);

insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id,source
) values(
  'fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a',current_date,'fc000000-0000-4000-8000-000000000001','online'
);

insert into public.attendance_evidence(
  id,tenant_id,school_id,register_submission_id,enrolment_id,attendance_date,storage_path,original_filename,mime_type,file_size,uploaded_by_user_id
) values(
  'fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'22222222-2222-4222-8222-222222222222/fc000000-0000-4000-8000-000000000001/medical.pdf','medical.pdf','application/pdf',1024,'fc000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select is(app_private.can_read_attendance_evidence('fc300000-0000-4000-8000-000000000001'),true,'evidence uploader can read own attachment');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select is(app_private.can_read_attendance_evidence('fc300000-0000-4000-8000-000000000001'),false,'ordinary teacher cannot read class medical evidence by generic school role');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select is(app_private.can_read_attendance_evidence('fc300000-0000-4000-8000-000000000001'),false,'librarian cannot read attendance medical evidence');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
select is(app_private.can_read_attendance_evidence('fc300000-0000-4000-8000-000000000001'),true,'assigned register teacher can read evidence for own class');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000005',true);
select is(app_private.can_read_attendance_evidence('fc300000-0000-4000-8000-000000000001'),true,'principal retains need-to-know attendance evidence access');

select ok(
  not has_function_privilege('authenticated','public.record_attendance_event(uuid,date,text,uuid,text,text,uuid,uuid,uuid,text)','EXECUTE'),
  'authenticated clients cannot bypass register workflows through legacy raw attendance event RPC'
);

select throws_ok(
  $$insert into public.attendance_evidence(tenant_id,school_id,register_submission_id,enrolment_id,attendance_date,storage_path,original_filename,mime_type,file_size,uploaded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',current_date,'22222222-2222-4222-8222-222222222222/fc000000-0000-4000-8000-000000000001/wrong.pdf','wrong.pdf','application/pdf',100,'fc000000-0000-4000-8000-000000000001')$$,
  '23514',null,
  'attendance evidence cannot be attached to a learner outside the submitted register class'
);

select * from finish();
rollback;