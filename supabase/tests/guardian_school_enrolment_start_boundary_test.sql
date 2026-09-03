begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd600000-0000-4000-8000-000000000001','guardian-start-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd600000-0000-4000-8000-000000000002','guardian-start-parent@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd600000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values(
  'fd610000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Future','Guardian','active'
);

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,
  is_emergency_contact,is_pickup_authorized,priority,effective_from
) values(
  '11111111-1111-4111-8111-111111111111',
  '50000000-0000-4000-8000-000000000001',
  'fd610000-0000-4000-8000-000000000001',
  'parent',true,true,true,1,current_date-30
);

insert into public.guardian_user_links(tenant_id,guardian_id,user_id)
values(
  '11111111-1111-4111-8111-111111111111',
  'fd610000-0000-4000-8000-000000000001',
  'fd600000-0000-4000-8000-000000000002'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd600000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_manage_guardians_for_learner('50000000-0000-4000-8000-000000000001'),
  true,
  'school administrator can manage guardian data while learner enrolment is effective'
);

select is(
  app_private.can_read_guardian('fd610000-0000-4000-8000-000000000001'),
  true,
  'school administrator can read linked guardian while learner enrolment is effective'
);

update public.enrolments
set enrolled_from=current_date+7,
    enrolled_to=null,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and status='current';

select is(
  app_private.can_manage_guardians_for_learner('50000000-0000-4000-8000-000000000001'),
  false,
  'future-start current-status enrolment does not grant school guardian management early'
);

select is(
  app_private.can_read_guardian('fd610000-0000-4000-8000-000000000001'),
  false,
  'future-start current-status enrolment does not grant school guardian identity reads early'
);

select ok(
  exists(
    select 1 from public.learner_guardians
    where guardian_id='fd610000-0000-4000-8000-000000000001'
      and learner_id='50000000-0000-4000-8000-000000000001'
      and effective_from<=current_date
      and (effective_to is null or effective_to>=current_date)
  ),
  'guardian relationship itself remains effective while school access waits for enrolment start'
);

select set_config('request.jwt.claim.sub','fd600000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_read_guardian('fd610000-0000-4000-8000-000000000001'),
  true,
  'linked guardian self-access remains available independent of learner school start date'
);

select * from finish();
rollback;
