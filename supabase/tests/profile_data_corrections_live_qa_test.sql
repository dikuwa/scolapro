begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('53900000-0000-4000-8000-000000000001','profile-qa-requester@example.test','authenticated','authenticated',now(),now()),
  ('53900000-0000-4000-8000-000000000002','profile-qa-stale@example.test','authenticated','authenticated',now(),now()),
  ('53900000-0000-4000-8000-000000000003','profile-qa-current@example.test','authenticated','authenticated',now(),now()),
  ('53900000-0000-4000-8000-000000000004','profile-qa-other-current@example.test','authenticated','authenticated',now(),now()),
  ('53900000-0000-4000-8000-000000000005','profile-qa-support@example.test','authenticated','authenticated',now(),now()),
  ('53900000-0000-4000-8000-000000000006','profile-qa-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('53910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Profile QA Other School','PROFILE-QA-OTHER','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('53920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','53900000-0000-4000-8000-000000000002','PCR-QA-STALE','Stale','Reviewer','active'),
  ('53920000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','53900000-0000-4000-8000-000000000003','PCR-QA-CURRENT','Current','Reviewer','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('53921000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '53920000-0000-4000-8000-000000000001','management',current_date-30,current_date-1,'53900000-0000-4000-8000-000000000001'),
  ('53921000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '53920000-0000-4000-8000-000000000002','management',current_date-30,null,'53900000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('53930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53900000-0000-4000-8000-000000000001',null,'class_teacher',current_date-20),
  ('53930000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53900000-0000-4000-8000-000000000002','53920000-0000-4000-8000-000000000001','school_admin',current_date-20),
  ('53930000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53900000-0000-4000-8000-000000000003','53920000-0000-4000-8000-000000000002','school_admin',current_date-20),
  ('53930000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53900000-0000-4000-8000-000000000004',null,'principal',current_date-20),
  ('53930000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','53910000-0000-4000-8000-000000000001','53900000-0000-4000-8000-000000000004',null,'principal',current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('53900000-0000-4000-8000-000000000005','platform_support',current_date),
  ('53900000-0000-4000-8000-000000000006','platform_admin',current_date);

set local session_replication_role = replica;
insert into public.profile_change_requests(
  id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,reason,status,
  requested_by_user_id,requested_at,created_at,updated_at
) values
  ('53940000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name',
   'Amara','Profile QA Corrected','verified source','pending','53900000-0000-4000-8000-000000000001',
   '2026-09-01T08:00:00Z','2026-09-01T08:00:00Z','2026-09-01T08:00:00Z'),
  ('53940000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name',
   'Amara','Self Review QA','self review fixture','pending','53900000-0000-4000-8000-000000000003',
   '2026-09-01T08:05:00Z','2026-09-01T08:05:00Z','2026-09-01T08:05:00Z');
set local session_replication_role = origin;

select is(
  app_private.user_can_review_profile_change_request('53900000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222'),
  false,
  'stale linked staff placement cannot review current-school profile corrections'
);
select is(
  app_private.user_can_review_profile_change_request('53900000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222'),
  true,
  'current linked management placement can review current-school profile corrections'
);
select is(
  app_private.user_can_review_profile_change_request('53900000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222'),
  false,
  'an older still-active school membership cannot review after another school becomes deterministic current school'
);
select is(
  app_private.user_can_review_profile_change_request('53900000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222'),
  false,
  'Platform Support has no profile-correction review authority'
);
select is(
  app_private.user_can_review_profile_change_request('53900000-0000-4000-8000-000000000006','22222222-2222-4222-8222-222222222222'),
  true,
  'Platform Admin retains the existing governed profile-correction review authority'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','53900000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  0,
  'stale placed reviewer cannot read the correction queue through RLS'
);
reset role;
select throws_ok(
  $$select public.review_profile_change_request('53940000-0000-4000-8000-000000000001','approved',null)$$,
  'P0001','Permission denied',
  'stale placed reviewer cannot call the review RPC'
);

select set_config('request.jwt.claim.sub','53900000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  0,
  'non-current school reviewer cannot read an older school correction queue'
);
reset role;
select throws_ok(
  $$select public.review_profile_change_request('53940000-0000-4000-8000-000000000001','rejected',null)$$,
  'P0001','Permission denied',
  'non-current school reviewer cannot review an older school request'
);

select set_config('request.jwt.claim.sub','53900000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profile_change_requests where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'Platform Support cannot read profile-change requests'
);
reset role;

select set_config('request.jwt.claim.sub','53900000-0000-4000-8000-000000000006',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  1,
  'governed Platform Admin can read a profile-change request under existing architecture'
);
reset role;

select set_config('request.jwt.claim.sub','53900000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.review_profile_change_request('53940000-0000-4000-8000-000000000002','approved',null)$$,
  'P0001','Profile change requester cannot review own request',
  'requester cannot self-review even with current school leadership authority'
);
select lives_ok(
  $$select public.review_profile_change_request('53940000-0000-4000-8000-000000000001','rejected','QA separation verified')$$,
  'distinct current-school reviewer can complete a governed review'
);

select is(
  (select requested_by_user_id from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  '53900000-0000-4000-8000-000000000001'::uuid,
  'historical requester provenance remains unchanged after review'
);
select is(
  (select requested_at from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  '2026-09-01T08:00:00Z'::timestamptz,
  'historical request timestamp remains unchanged after review'
);
select is(
  (select reviewed_by_user_id from public.profile_change_requests where id='53940000-0000-4000-8000-000000000001'),
  '53900000-0000-4000-8000-000000000003'::uuid,
  'reviewer provenance is recorded on the final request'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='53921000-0000-4000-8000-000000000002';

select throws_ok(
  $$update public.profile_change_requests
      set reviewed_by_user_id='53900000-0000-4000-8000-000000000006'
    where id='53940000-0000-4000-8000-000000000001'$$,
  'P0001','Final profile change request lifecycle provenance is immutable',
  'later placement change cannot be used to rewrite final review provenance'
);

select is(
  (select count(*)::integer from public.audit_events
    where entity_type='profile_change_request'
      and entity_id='53940000-0000-4000-8000-000000000001'
      and event_type='profile_change.rejected'
      and actor_user_id='53900000-0000-4000-8000-000000000003'),
  1,
  'final review audit event preserves the reviewing actor'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_review_profile_change_request(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_review_profile_change_request(uuid,uuid)','EXECUTE'),
  'arbitrary-user profile review authority helper remains private'
);

select * from finish();
rollback;
