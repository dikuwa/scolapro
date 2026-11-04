begin;

select plan(13);

select is(
  has_column_privilege('authenticated','public.sports_house_learner_roster','date_of_birth','SELECT'),
  false,
  'authenticated clients cannot bypass the explicit DOB export through the legacy roster view'
);

select is(
  has_column_privilege('authenticated','public.sports_house_learner_roster','age_on_reference_date','SELECT'),
  true,
  'authenticated clients retain non-DOB legacy roster access'
);

select is(
  has_column_privilege('anon','public.sports_house_learner_roster','date_of_birth','SELECT'),
  false,
  'anonymous clients cannot read raw DOB through the legacy Sports roster view'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('eb000000-0000-4000-8000-000000000001','sports-dob-admin@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000002','sports-dob-teacher@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000003','sports-dob-support@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','eb000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','eb000000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('eb000000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.schools(id,tenant_id,name,status) values
  ('eb010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other DOB Export School','active');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
  ('eb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Learner','2010-06-30','female'),
  ('eb200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Historical','Learner','2009-01-02','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
  ('eb210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','eb200000-0000-4000-8000-000000000001',2026,current_date,'current'),
  ('eb210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','eb200000-0000-4000-8000-000000000001',2042,'2042-01-01','completed'),
  ('eb210000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','eb200000-0000-4000-8000-000000000002',2042,'2042-01-01','completed');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000001',true);

insert into public.sports_houses(id,tenant_id,school_id,name,created_by_user_id) values
  ('eb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','DOB Privacy House','eb000000-0000-4000-8000-000000000001');

set local role authenticated;

select lives_ok(
  $$select public.assign_learner_sports_house('22222222-2222-4222-8222-222222222222',2042,'eb200000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','manual',false)$$,
  'authorized admin assigns the currently identity-authorized learner to the historical roster'
);

select lives_ok(
  $$select public.assign_learner_sports_house('22222222-2222-4222-8222-222222222222',2042,'eb200000-0000-4000-8000-000000000002','eb100000-0000-4000-8000-000000000001','manual',false)$$,
  'authorized admin assigns a historical learner without current identity scope'
);

select is(
  (select count(*)::integer from public.get_sports_house_operational_learner_roster_v2('22222222-2222-4222-8222-222222222222',2042)),
  2,
  'historical roster membership remains visible to a school administrator'
);

select is(
  (select date_of_birth::text from public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb100000-0000-4000-8000-000000000001']::uuid[],true
  ) where learner_id='eb200000-0000-4000-8000-000000000001'),
  '2010-06-30',
  'explicit DOB export returns a date only when canonical learner identity is authorized'
);

select is(
  (select count(*)::integer from public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb100000-0000-4000-8000-000000000001']::uuid[],true
  ) where learner_id='eb200000-0000-4000-8000-000000000002'),
  0,
  'completed historical roster membership alone does not grant DOB access'
);

select throws_ok(
  $$select public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb100000-0000-4000-8000-000000000001']::uuid[],false
  )$$,
  'DOB export must be explicitly selected',
  'database rejects calls that do not explicitly select the DOB export'
);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000002',true);

select is(
  (select count(*)::integer from public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb100000-0000-4000-8000-000000000001']::uuid[],true
  )),
  0,
  'teacher without per-learner identity scope receives no raw DOB rows'
);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000003',true);

select throws_ok(
  $$select public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb100000-0000-4000-8000-000000000001']::uuid[],true
  )$$,
  'Permission denied',
  'Platform Support cannot invoke the DOB export RPC'
);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.get_sports_house_roster_dob_export(
    '22222222-2222-4222-8222-222222222222',2042,array['eb010000-0000-4000-8000-000000000001']::uuid[],true
  )$$,
  'Sports house must belong to the requested school',
  'DOB export cannot cross school house boundaries'
);

select is(
  has_function_privilege('anon','public.get_sports_house_roster_dob_export(uuid,integer,uuid[],boolean)','EXECUTE'),
  false,
  'anonymous users cannot invoke the DOB export RPC'
);

select * from finish();
rollback;
