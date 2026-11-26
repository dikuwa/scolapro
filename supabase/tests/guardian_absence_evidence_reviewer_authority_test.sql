begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb700000-0000-4000-8000-000000000001','evidence-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fb700000-0000-4000-8000-000000000002','evidence-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb700000-0000-4000-8000-000000000003','evidence-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fb700000-0000-4000-8000-000000000004','evidence-hod@example.test','authenticated','authenticated',now(),now()),
  ('fb700000-0000-4000-8000-000000000005','evidence-librarian@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fb710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Evidence School A','TST-EVD-A','active');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fb720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Evidence','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fb730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb720000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values ('fb740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Evidence','Guardian');

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

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb700000-0000-4000-8000-000000000002','school_admin',current_date-10),
  ('11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb700000-0000-4000-8000-000000000003','teacher',current_date-10),
  ('11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb700000-0000-4000-8000-000000000004','hod',current_date-10),
  ('11111111-1111-4111-8111-111111111111','fb710000-0000-4000-8000-000000000001','fb700000-0000-4000-8000-000000000005','librarian',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000001',true);
select ok(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  'current effective guardian can read their own absence evidence'
);

select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000002',true);
select ok(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  'authorized school reviewer can read absence evidence'
);

select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'ordinary teacher with operational learner visibility cannot read absence evidence'
);

select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000004',true);
select is(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'HOD without notice review authority cannot read absence evidence'
);

select set_config('request.jwt.claim.sub','fb700000-0000-4000-8000-000000000005',true);
select is(
  app_private.can_access_guardian_absence_object(
    'fb710000-0000-4000-8000-000000000001/fb700000-0000-4000-8000-000000000001/fb770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'librarian cannot enumerate or sign guardian absence evidence'
);

select ok(
  not has_function_privilege('authenticated','app_private.can_access_guardian_absence_object(text)','EXECUTE'),
  'artifact authorization helper remains private from authenticated direct execution'
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
  'storage reads remain gated by the reviewer-aligned helper'
);

select * from finish();
rollback;
