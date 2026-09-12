begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fdd00000-0000-4000-8000-000000000001','profile-requester@example.test','authenticated','authenticated',now(),now()),
('fdd00000-0000-4000-8000-000000000002','profile-stale-reviewer@example.test','authenticated','authenticated',now(),now()),
('fdd00000-0000-4000-8000-000000000003','profile-current-reviewer@example.test','authenticated','authenticated',now(),now()),
('fdd00000-0000-4000-8000-000000000004','profile-support@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fdd10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Profile Boundary School','PROFILE-B-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000001','school_admin',current_date-3),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000002','school_admin',current_date-3),
('11111111-1111-4111-8111-111111111111','fdd10000-0000-4000-8000-000000000001','fdd00000-0000-4000-8000-000000000002','school_admin',current_date-1),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.platform_memberships(user_id,role_key,active_from) values
('fdd00000-0000-4000-8000-000000000004','platform_support',current_date);

insert into public.profile_change_requests(
  id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
) values
('fdd20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name','Amara','Separated Review','fdd00000-0000-4000-8000-000000000001'),
('fdd20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name','Amara','Self Review','fdd00000-0000-4000-8000-000000000001');

select is(app_private.user_can_review_profile_change_request('fdd00000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222'),false,'older still-active school is not review authority once another school is current');
select is(app_private.user_can_review_profile_change_request('fdd00000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222'),true,'current-school leadership retains review authority');
select is(app_private.user_can_review_profile_change_request('fdd00000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222'),false,'platform_support has no operational profile-change review authority');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.review_profile_change_request('fdd20000-0000-4000-8000-000000000001','approved',null)$$,
  'P0001','Permission denied',
  'direct review RPC denies an older active non-current school'
);
select is((select status from public.profile_change_requests where id='fdd200000-0000-4000-8000-000000000001'),'pending','non-current-school denial leaves request pending');

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.review_profile_change_request('fdd20000-0000-4000-8000-000000000001','approved',null)$$,
  'P0001','Permission denied',
  'platform_support cannot perform operational identity correction'
);

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.review_profile_change_request('fdd20000-0000-4000-8000-000000000002','approved',null)$$,
  'P0001','Profile change requester cannot review own request',
  'requester cannot self-review even when holding school leadership authority'
);

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$select public.review_profile_change_request('fdd20000-0000-4000-8000-000000000001','rejected','boundary test')$$,
  'distinct current-school leader can review a pending request'
);
select throws_ok(
  $$update public.profile_change_requests set status='approved' where id='fdd20000-0000-4000-8000-000000000001'$$,
  'P0001','Final profile change request lifecycle provenance is immutable',
  'reviewed request remains terminal and immutable'
);

select * from finish();
rollback;
