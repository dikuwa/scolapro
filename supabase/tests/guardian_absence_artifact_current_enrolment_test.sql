begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb700000-0000-4000-8000-000000000001','artifact-enrolment-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fb700000-0000-4000-8000-000000000002','artifact-enrolment-support@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values ('fb710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact Enrolment School','TST-ART-ENROL','active');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fb720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact','Enrolment');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fb730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb720000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values ('fb740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values ('fb750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb720000-0000-4000-8000-000000000001','fb740000-0000-4000-8000-000000000001',1,current_date-30);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values ('fb760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb740000-0000-4000-8000-000000000001','fb700000-0000-4000-8000-000000000001');

insert into public.guardian_absence_notices(
  id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to
) values (
  'fb770000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001',
  'fb720000-0000-4000-8000-000000000001','fb730000-0000-4000-8000-000000000001','fb740000-0000-4000-8000-000000000001',
  'fb700000-0000-4000-8000-000000000001',current_date,current_date
);

insert into public.platform_memberships(user_id,role_key,active_from)
values ('fb700000-0000-4000-8000-000000000002','platform_support',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000001',true);

select ok(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  'current guardian relationship plus current notice enrolment permits guardian artifact read'
);

update public.enrolments
set enrolled_to = current_date - 1
where id = 'fb730000-0000-4000-8000-000000000001';

select is(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'ended notice enrolment removes guardian current artifact access even while relationship remains effective'
);

select is(
  (select count(*) from public.guardian_absence_notices where id='fb770000-0000-4000-8000-000000000001'),
  1::bigint,
  'ending enrolment preserves the historical absence notice row'
);

select is(
  (select count(*) from public.learner_guardians where id='fb750000-0000-4000-8000-000000000001'),
  1::bigint,
  'ending enrolment preserves guardian relationship provenance'
);

select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'Platform Support receives no sensitive guardian absence artifact read authority'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='authorized users read guardian absence evidence'
      and qual like '%can_access_guardian_absence_object%'
  ),
  'storage read policy remains bound to the hardened artifact authorization helper'
);

select * from finish();
rollback;
