begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('fa800000-0000-4000-8000-000000000001','photo-current-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fa810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Photo Current School A','TST-PHOTO-CURRENT-A','active'),
  ('fa810000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Photo Current School B','TST-PHOTO-CURRENT-B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fa810000-0000-4000-8000-000000000001','fa800000-0000-4000-8000-000000000001','school_admin',current_date-10);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values ('fa820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Photo','Current School','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fa830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa810000-0000-4000-8000-000000000001','fa820000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source)
values ('fa840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa810000-0000-4000-8000-000000000001','fa820000-0000-4000-8000-000000000001','PHOTO-CURRENT-001','manual');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa800000-0000-4000-8000-000000000001',true);

select ok(
  app_private.can_manage_learner_photo_object('fa810000-0000-4000-8000-000000000001/fa820000-0000-4000-8000-000000000001/new.jpg'),
  'school admin can manage learner photos in the current school'
);
select ok(
  app_private.can_access_learner_photo_object('fa810000-0000-4000-8000-000000000001/fa820000-0000-4000-8000-000000000001/new.jpg'),
  'school admin can read learner photos in the current school'
);

-- The later active membership becomes current under #411/#416 ordering.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fa810000-0000-4000-8000-000000000002','fa800000-0000-4000-8000-000000000001','school_admin',current_date);

select is(
  app_private.can_manage_learner_photo_object('fa810000-0000-4000-8000-000000000001/fa820000-0000-4000-8000-000000000001/new.jpg'),
  false,
  'storage write policy cannot borrow school_admin authority from a non-current active school'
);
select is(
  app_private.can_access_learner_photo_object('fa810000-0000-4000-8000-000000000001/fa820000-0000-4000-8000-000000000001/new.jpg'),
  false,
  'storage read and signed-URL boundary denies learner photo from non-current school'
);

set local role authenticated;
select throws_ok(
  $$select public.set_learner_photo('fa820000-0000-4000-8000-000000000001','fa810000-0000-4000-8000-000000000001',null)$$,
  'Permission denied',
  'direct SECURITY DEFINER learner photo mutation cannot target the non-current school'
);
reset role;

select * from finish();
rollback;
