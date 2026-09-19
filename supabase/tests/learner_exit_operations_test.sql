begin;

select plan(9);

select has_function(
  'public','exit_learner_enrolment',array['uuid','text','date','text']::text[],
  'governed learner exit function exists'
);
select ok(
  not has_function_privilege('anon','public.exit_learner_enrolment(uuid,text,date,text)','EXECUTE'),
  'anonymous clients cannot invoke learner exit'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe000000-0000-4000-8000-000000000001','exit-admin@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','exit-outsider@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','teacher',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.exit_learner_enrolment('60000000-0000-4000-8000-000000000002','withdrawn',current_date,'Not authorized')$$,
  'Permission denied',
  'non-leadership school role cannot close an enrolment'
);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.exit_learner_enrolment('60000000-0000-4000-8000-000000000002','withdrawn',current_date,'Family relocation')$$,
  'current-school leadership can record a withdrawal'
);
select is((select status from public.enrolments where id='60000000-0000-4000-8000-000000000002'),'withdrawn','withdrawal closes only the source enrolment');
select is((select enrolled_to from public.enrolments where id='60000000-0000-4000-8000-000000000002'),current_date,'effective date is preserved on the enrolment');
select is((select count(*)::integer from public.audit_events where entity_type='enrolment' and entity_id='60000000-0000-4000-8000-000000000002' and event_type='learner.enrolment.exited'),1,'exit provenance is audited');
select is((select count(*)::integer from public.learners where id='50000000-0000-4000-8000-000000000002'),1,'learner identity remains intact');
select throws_ok(
  $$select public.exit_learner_enrolment('60000000-0000-4000-8000-000000000002','left',current_date,'Second close')$$,
  'Only a current enrolment can be exited',
  'a finalized exit cannot be casually rewritten'
);

select * from finish();
rollback;
