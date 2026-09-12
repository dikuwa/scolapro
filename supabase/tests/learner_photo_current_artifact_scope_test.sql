begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc000000-0000-4000-8000-000000000001','photo-current-admin@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000002','photo-stale-admin@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000003','photo-support-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Photo Old School','PHOTO-OLD','active'),
  ('fc100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Photo Current School','PHOTO-CURRENT','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000001','PHOTO-CUR','Photo','Current','active'),
  ('fc200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000002','PHOTO-END','Photo','Ended','active'),
  ('fc200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000003','PHOTO-SUP','Photo','Support','active');

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
) values
  ('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','school_admin',current_date-30,null),
  ('fc300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','school_admin',current_date-10,null),
  ('fc300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000002','school_admin',current_date-20,null),
  ('fc300000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000003','fc200000-0000-4000-8000-000000000003','school_admin',current_date-20,null);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  ('fc400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000001','management','Current Admin',current_date-10,null,'fc000000-0000-4000-8000-000000000001'),
  ('fc400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000002','management','Former Admin',current_date-30,current_date-1,'fc000000-0000-4000-8000-000000000001'),
  ('fc400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000003','management','Support Admin',current_date-20,null,'fc000000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('fc500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Photo Learner'),
  ('fc500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Old','Photo Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
  ('fc600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc500000-0000-4000-8000-000000000001',2026,current_date-30,'current'),
  ('fc600000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000002',2026,current_date-30,'current');

insert into public.platform_memberships(user_id,role_key,active_from)
values ('fc000000-0000-4000-8000-000000000003','platform_support',current_date-20);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.can_prepare_learner_photo_upload(
    'fc100000-0000-4000-8000-000000000002',
    'fc500000-0000-4000-8000-000000000001'
  ),
  true,
  'current-school school admin with effective placement can prepare a current learner photo upload'
);

select is(
  public.can_prepare_learner_photo_upload(
    'fc100000-0000-4000-8000-000000000001',
    'fc500000-0000-4000-8000-000000000002'
  ),
  false,
  'another active non-current school cannot prepare a learner photo upload'
);

reset role;
update public.enrolments
set enrolled_to = current_date - 1
where id = 'fc600000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  public.can_prepare_learner_photo_upload(
    'fc100000-0000-4000-8000-000000000002',
    'fc500000-0000-4000-8000-000000000001'
  ),
  false,
  'ended learner enrolment removes current learner-photo mutation authority'
);

reset role;
select is(
  (select count(*) from public.enrolments where id='fc600000-0000-4000-8000-000000000001'),
  1::bigint,
  'ending learner enrolment preserves enrolment provenance'
);
update public.enrolments
set enrolled_to = null
where id = 'fc600000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  public.can_prepare_learner_photo_upload(
    'fc100000-0000-4000-8000-000000000002',
    'fc500000-0000-4000-8000-000000000001'
  ),
  false,
  'ended authoritative staff placement cannot retain learner-photo mutation authority through stale school membership'
);

select throws_ok(
  $$select public.set_learner_photo('fc500000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002',null)$$,
  'Permission denied',
  'stale staff placement cannot link or clear a protected learner photo reference'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select is(
  public.can_prepare_learner_photo_upload(
    'fc100000-0000-4000-8000-000000000002',
    'fc500000-0000-4000-8000-000000000001'
  ),
  false,
  'Platform Support cannot inherit learner-photo write authority from a simultaneous school-admin membership'
);

reset role;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_manage_learner_photo_object(
    'fc100000-0000-4000-8000-000000000002/fc500000-0000-4000-8000-000000000001/photo.jpg'
  ),
  true,
  'storage write helper delegates to the same hardened current artifact target authorization'
);

select * from finish();
rollback;
