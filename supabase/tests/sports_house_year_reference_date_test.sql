begin;

select plan(26);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ea000000-0000-4000-8000-000000000001','sports-year-admin@example.test','authenticated','authenticated',now(),now()),
  ('ea000000-0000-4000-8000-000000000002','sports-year-principal@example.test','authenticated','authenticated',now(),now()),
  ('ea000000-0000-4000-8000-000000000003','sports-year-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ea000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ea000000-0000-4000-8000-000000000002','principal',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ea000000-0000-4000-8000-000000000003','teacher',current_date);

insert into public.schools(id,tenant_id,name,status) values
  ('ea010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other Sports Year School','active');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
  ('ea200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Reference','Birthday','2026-06-30','female'),
  ('ea200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Future','Birthday','2042-07-01','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
  ('ea210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ea200000-0000-4000-8000-000000000001',2042,'2042-01-01','current'),
  ('ea210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ea200000-0000-4000-8000-000000000002',2042,'2042-01-01','current');

select has_function(
  'public',
  'set_sports_year_reference_date',
  array['uuid','integer','date','boolean'],
  'explicit Sports year reference-date RPC exists'
);

select is(
  has_function_privilege('anon','public.set_sports_year_reference_date(uuid,integer,date,boolean)','EXECUTE'),
  false,
  'anonymous users cannot configure a Sports age reference date'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select age_on_reference_date from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000001'),
  null::integer,
  'missing year settings leave age unresolved'
);

select is(
  (select age_group_label from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000001'),
  null::text,
  'missing year settings leave age group unresolved'
);

select lives_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2042-06-30',true)$$,
  'school administrator explicitly creates a year context with approved date'
);

select is(
  (select age_reference_date::text from public.sports_year_settings where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2042),
  '2042-06-30',
  'the confirmed date is read back from the canonical school/year settings row'
);

select is(
  (select created_by_user_id from public.sports_year_settings where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2042),
  'ea000000-0000-4000-8000-000000000001'::uuid,
  'new year context records the authenticated school administrator'
);

select is(
  (select count(*)::integer from public.audit_events where school_id='22222222-2222-4222-8222-222222222222' and actor_user_id='ea000000-0000-4000-8000-000000000001' and event_type='sports.year_reference_date.configured'),
  1,
  'initial reference-date setup creates an immutable actor audit event'
);

select lives_ok(
  $$select public.upsert_sports_age_group('22222222-2222-4222-8222-222222222222','QA Age 16',16,16,1,null)$$,
  'school-defined age group remains an independent configuration'
);

select lives_ok(
  $$select public.set_sports_year_settings('22222222-2222-4222-8222-222222222222',2042,'2042-03-31','rebalance_each_year',false,true,true)$$,
  'existing governed year settings remain available with their current permissions'
);

select lives_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2042-06-30',true)$$,
  'date-only update succeeds without replacing other year settings'
);

select is(
  (select assignment_continuity from public.sports_year_settings where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2042),
  'rebalance_each_year',
  'date-only update preserves assignment continuity'
);

select is(
  (select balance_by_sex from public.sports_year_settings where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2042),
  false,
  'date-only update preserves learner balancing settings'
);

select is(
  (select count(*)::integer from public.audit_events where school_id='22222222-2222-4222-8222-222222222222' and event_type like 'sports.year_reference_date.%'),
  3,
  'reference-date creation and both date changes are audited'
);

select is(
  (select metadata->>'previous_age_reference_date' from public.audit_events where school_id='22222222-2222-4222-8222-222222222222' and metadata->>'age_reference_date'='2042-06-30' and metadata->>'previous_age_reference_date'='2042-03-31'),
  '2042-03-31',
  'audit evidence retains the prior approved reference date'
);

select is(
  (select count(*)::integer from public.audit_events where school_id='22222222-2222-4222-8222-222222222222' and event_type like 'sports.year_reference_date.%' and actor_user_id='ea000000-0000-4000-8000-000000000001'),
  3,
  'date audit events retain the authenticated actor'
);

select is(
  (select age_on_reference_date from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000001'),
  16,
  'learner birthday on the configured cutoff resolves to the inclusive completed age'
);

select is(
  (select age_group_label from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000001'),
  'QA Age 16',
  'eligible learner resolves only through the configured school age band'
);

select is(
  (select date_of_birth::text from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000002'),
  '2042-07-01',
  'DOB remains the canonical learner date for a future-DOB row'
);

select is(
  (select age_on_reference_date from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000002'),
  null::integer,
  'DOB after the cutoff does not produce a negative or otherwise resolved age'
);

select is(
  (select age_group_label from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042) where learner_id='ea200000-0000-4000-8000-000000000002'),
  null::text,
  'DOB after the cutoff cannot resolve an age group'
);

select throws_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2042-06-30',false)$$,
  'Confirm school approval before saving the reference date',
  'the database requires explicit approval confirmation'
);

select throws_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2041-12-31',true)$$,
  'Age reference date must be within the selected academic year',
  'the reference date must belong to the requested academic year'
);

select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2042-06-30',true)$$,
  'principal retains the existing Sports manager permission'
);

select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.set_sports_year_reference_date('22222222-2222-4222-8222-222222222222',2042,'2042-06-30',true)$$,
  'Permission denied',
  'ordinary teacher cannot configure the Sports year context'
);

select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.set_sports_year_reference_date('ea010000-0000-4000-8000-000000000001',2042,'2042-06-30',true)$$,
  'Permission denied',
  'school administrator cannot configure another school year'
);

select * from finish();
rollback;
