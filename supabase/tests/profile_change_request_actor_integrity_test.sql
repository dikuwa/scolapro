begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd900000-0000-4000-8000-000000000001','profile-actor-requester@example.test','authenticated','authenticated',now(),now()),
  ('fd900000-0000-4000-8000-000000000002','profile-actor-reviewer@example.test','authenticated','authenticated',now(),now()),
  ('fd900000-0000-4000-8000-000000000003','profile-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd900000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd900000-0000-4000-8000-000000000002','school_admin',current_date);

select throws_ok(
  $$insert into public.profile_change_requests(
      tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,
      status,requested_by_user_id,reviewed_by_user_id,reviewed_at,applied_at
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001',
      'preferred_name',null,'Actor QA','approved','fd900000-0000-4000-8000-000000000001',
      'fd900000-0000-4000-8000-000000000002',now(),now()
    )$$,
  'Profile change requests must be created pending without review provenance',
  'trusted write cannot manufacture a pre-reviewed profile change request'
);

select throws_ok(
  $$insert into public.profile_change_requests(
      tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001',
      'preferred_name',null,'Outsider proposal','fd900000-0000-4000-8000-000000000003'
    )$$,
  'Profile change requester is not authorized for learner',
  'trusted write cannot forge an unrelated profile-change requester'
);

select lives_ok(
  $$insert into public.profile_change_requests(
      id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
    ) values(
      'fd910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001',
      'preferred_name',null,'Actor QA','fd900000-0000-4000-8000-000000000001'
    )$$,
  'authorized proposer can create a canonical pending profile change request'
);

select throws_ok(
  $$update public.profile_change_requests
    set status='approved',reviewed_by_user_id='fd900000-0000-4000-8000-000000000003',reviewed_at=now(),applied_at=now()
    where id='fd910000-0000-4000-8000-000000000001'$$,
  'Profile change reviewer is not authorized for school',
  'trusted write cannot forge an unrelated reviewer'
);

select lives_ok(
  $$update public.profile_change_requests
    set status='approved',reviewed_by_user_id='fd900000-0000-4000-8000-000000000002',reviewed_at=now(),applied_at=now()
    where id='fd910000-0000-4000-8000-000000000001'$$,
  'authorized school leader can approve a pending request with complete provenance'
);

select throws_ok(
  $$update public.profile_change_requests set reviewed_by_user_id='fd900000-0000-4000-8000-000000000003'
    where id='fd910000-0000-4000-8000-000000000001'$$,
  'Final profile change request lifecycle provenance is immutable',
  'final reviewer provenance cannot be rewritten'
);

select throws_ok(
  $$update public.profile_change_requests set status='rejected'
    where id='fd910000-0000-4000-8000-000000000001'$$,
  'Final profile change request lifecycle provenance is immutable',
  'final profile change decision cannot be rewritten'
);

select ok(
  (select status='approved'
          and requested_by_user_id='fd900000-0000-4000-8000-000000000001'::uuid
          and reviewed_by_user_id='fd900000-0000-4000-8000-000000000002'::uuid
          and reviewed_at is not null and applied_at is not null
     from public.profile_change_requests where id='fd910000-0000-4000-8000-000000000001'),
  'approved lifecycle preserves durable proposer and reviewer provenance'
);

insert into public.profile_change_requests(
  id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
) values(
  'fd910000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001',
  'preferred_name',null,'Cancel QA','fd900000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$update public.profile_change_requests set status='cancelled'
    where id='fd910000-0000-4000-8000-000000000002'$$,
  'Only the authenticated requester can cancel a profile change request',
  'trusted write without requester authentication cannot manufacture cancellation'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd900000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.cancel_profile_change_request('fd910000-0000-4000-8000-000000000002')$$,
  'authenticated requester can cancel their own pending request through the governed RPC'
);

reset role;

select is(
  (select status from public.profile_change_requests where id='fd910000-0000-4000-8000-000000000002'),
  'cancelled',
  'requester cancellation persists as terminal state'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_submit_profile_change_request(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_submit_profile_change_request(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_review_profile_change_request(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_review_profile_change_request(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_profile_change_request_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_profile_change_request_actor_integrity()','EXECUTE'),
  'profile-change actor helpers remain private from client roles'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgrelid='public.profile_change_requests'::regclass
     and tgname='profile_change_request_submit_review_actor_integrity_trg'
     and not tgisinternal),
  1,
  'profile-change actor integrity trigger is installed once'
);

select * from finish();
rollback;
