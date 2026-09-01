begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa300000-0000-4000-8000-000000000001','absence-owner@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000002','absence-librarian@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000003','absence-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000004','absence-class@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000005','absence-principal@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000006','absence-counsellor@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fa310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa300000-0000-4000-8000-000000000004','ABS-CLASS-001','Assigned','Teacher','active'
);

update public.register_classes
set register_teacher_staff_id='fa310000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000002',null,'librarian',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000003',null,'teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000004','fa310000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000005',null,'principal',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000006',null,'counsellor',current_date);

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('fa320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence','Owner');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values('fa325000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa320000-0000-4000-8000-000000000001',1,current_date);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values('fa326000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa320000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001');

insert into public.guardian_absence_notices(
  id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
  absence_from,absence_to,reason_category,message
) values(
  'fa330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','fa320000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
  current_date,current_date,'illness','Sensitive medical absence test'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001'),
  false,
  'librarian operational learner access does not expose guardian medical absence evidence'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001'),
  false,
  'ordinary teacher role alone does not expose guardian medical absence evidence'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000004',true);
select is(
  app_private.can_review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001'),
  true,
  'assigned register teacher can review absence evidence for own class learner'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000005',true);
select is(
  app_private.can_review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001'),
  true,
  'principal retains school leadership review scope'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000006',true);
select is(
  app_private.can_review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001'),
  true,
  'counsellor retains explicit wellbeing review scope'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001','accepted','should not be allowed')$$,
  'Permission denied',
  'librarian cannot review or accept guardian absence notice'
);

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000004',true);
select is(
  public.review_guardian_absence_notice('fa330000-0000-4000-8000-000000000001','accepted','Reviewed by assigned class teacher'),
  true,
  'assigned register teacher can complete the review workflow'
);

select * from finish();
rollback;