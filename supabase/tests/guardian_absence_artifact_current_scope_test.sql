begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa700000-0000-4000-8000-000000000001','artifact-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fa700000-0000-4000-8000-000000000002','artifact-staff@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fa710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact School A','TST-ART-A','active'),
  ('fa710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Artifact School B','TST-ART-B','active');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fa720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fa730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa710000-0000-4000-8000-000000000001','fa720000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values ('fa740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Artifact','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values ('fa750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa720000-0000-4000-8000-000000000001','fa740000-0000-4000-8000-000000000001',1,current_date-30);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values ('fa760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa740000-0000-4000-8000-000000000001','fa700000-0000-4000-8000-000000000001');

insert into public.guardian_absence_notices(
  id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to
) values (
  'fa770000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa710000-0000-4000-8000-000000000001',
  'fa720000-0000-4000-8000-000000000001','fa730000-0000-4000-8000-000000000001','fa740000-0000-4000-8000-000000000001',
  'fa700000-0000-4000-8000-000000000001',current_date,current_date
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa700000-0000-4000-8000-000000000001',true);
select ok(
  app_private.can_access_guardian_absence_object(
    'fa710000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  'current effective guardian can read absence evidence'
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fa710000-0000-4000-8000-000000000001','fa700000-0000-4000-8000-000000000002','school_admin',current_date-10);

select set_config('request.jwt.claim.sub','fa700000-0000-4000-8000-000000000002',true);
select ok(
  app_private.can_access_guardian_absence_object(
    'fa710000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  'authorized staff can read absence evidence in their current school'
);

-- A later active membership becomes the deterministic current school under #411/#416.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fa710000-0000-4000-8000-000000000002','fa700000-0000-4000-8000-000000000002','school_admin',current_date);

select is(
  app_private.can_access_guardian_absence_object(
    'fa710000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'staff cannot borrow an active membership from a non-current school to read evidence'
);

update public.learner_guardians
set effective_to = current_date - 1
where id = 'fa750000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','fa700000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_access_guardian_absence_object(
    'fa710000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa770000-0000-4000-8000-000000000001/evidence.pdf'
  ),
  false,
  'historical submitter loses evidence read authority when guardian relationship ends'
);

set local role authenticated;
select throws_ok(
  $$select public.register_guardian_absence_attachment(
    'fa770000-0000-4000-8000-000000000001',
    'fa710000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa770000-0000-4000-8000-000000000001/evidence.pdf',
    'evidence.pdf','application/pdf',128
  )$$,
  'Guardian relationship is no longer active for this learner',
  'ended guardian cannot call SECURITY DEFINER attachment registration directly'
);
reset role;

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
  'authenticated storage reads and signed-URL minting remain gated by the current-scope helper'
);

select * from finish();
rollback;
