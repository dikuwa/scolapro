begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fb000000-0000-4000-8000-000000000001','guardian-current-school-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000002','guardian-platform-support@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000003','guardian-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian Current School A','TST-GUARD-CURRENT-A','active'),
  ('fb100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Guardian Current School B','TST-GUARD-CURRENT-B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','school_admin',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from)
values
  ('fb000000-0000-4000-8000-000000000002','platform_support',current_date),
  ('fb000000-0000-4000-8000-000000000003','platform_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values ('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian','Boundary Learner','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values ('fb400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian','Boundary','GUARD-CURRENT-001');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values ('fb500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb200000-0000-4000-8000-000000000001','fb400000-0000-4000-8000-000000000001','guardian',1,current_date-20);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_manage_guardians_for_learner('fb200000-0000-4000-8000-000000000001'),
  true,
  'school admin can manage guardian records for a currently enrolled learner in the current school'
);
select is(
  app_private.can_read_guardian('fb400000-0000-4000-8000-000000000001'),
  true,
  'school admin can read guardian context in the current school'
);

-- Later active membership becomes deterministic current school under #411/#416 ordering.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000001','school_admin',current_date);

select is(
  app_private.can_manage_guardians_for_learner('fb200000-0000-4000-8000-000000000001'),
  false,
  'guardian write authority cannot be borrowed from another active non-current school'
);
select is(
  app_private.can_read_guardian('fb400000-0000-4000-8000-000000000001'),
  false,
  'guardian read authority cannot be borrowed from another active non-current school'
);

set local role authenticated;
select throws_ok(
  $$select * from public.search_guardian_directory('fb100000-0000-4000-8000-000000000001',null,50)$$,
  'Permission denied',
  'SECURITY DEFINER guardian directory rejects another active non-current school'
);
reset role;

-- Restore school A as current without violating school_memberships date integrity: keep both
-- memberships active, but move school B's start earlier so deterministic ordering selects A.
update public.school_memberships
set active_from=current_date-20
where school_id='fb100000-0000-4000-8000-000000000002'
  and user_id='fb000000-0000-4000-8000-000000000001';
update public.learner_guardians
set effective_to=current_date-1
where id='fb500000-0000-4000-8000-000000000001';

select is(
  app_private.can_read_guardian('fb400000-0000-4000-8000-000000000001'),
  false,
  'ended guardian relationship does not retain current learner guardian access'
);
select is(
  (select count(*) from public.learner_guardians where id='fb500000-0000-4000-8000-000000000001'),
  1::bigint,
  'ending relationship preserves the historical relationship row'
);

-- Re-open relationship, then end enrolment: school-local operational scope must end even if
-- the historical status value itself remains current.
update public.learner_guardians
set effective_to=null
where id='fb500000-0000-4000-8000-000000000001';
update public.enrolments
set enrolled_to=current_date-1
where id='fb300000-0000-4000-8000-000000000001';

select is(
  app_private.can_manage_guardians_for_learner('fb200000-0000-4000-8000-000000000001'),
  false,
  'ended learner enrolment removes school-local guardian management scope'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_read_guardian('fb400000-0000-4000-8000-000000000001'),
  false,
  'Platform Support receives no guardian contact/address read authority'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_read_guardian('fb400000-0000-4000-8000-000000000001'),
  true,
  'Platform Admin retains governed guardian access'
);

select * from finish();
rollback;
