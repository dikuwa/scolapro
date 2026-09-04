begin;

select plan(12);

select has_function(
  'app_private','enforce_transfer_actor_lifecycle_integrity',array[]::text[],
  'transfer actor lifecycle helper exists'
);

select trigger_is(
  'public','transfer_events','transfer_actor_lifecycle_integrity_trg',
  'app_private','enforce_transfer_actor_lifecycle_integrity',
  'transfer actor lifecycle trigger is installed'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_transfer_actor_lifecycle_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_transfer_actor_lifecycle_integrity()','EXECUTE'),
  'transfer actor lifecycle helper is private from clients'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6a00000-0000-4000-8000-000000000001','transfer-actor-admin-a@example.test','authenticated','authenticated',now(),now()),
('f6a00000-0000-4000-8000-000000000002','transfer-actor-admin-b@example.test','authenticated','authenticated',now(),now()),
('f6a00000-0000-4000-8000-000000000003','transfer-actor-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6a00000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6a00000-0000-4000-8000-000000000002','principal',current_date);

select throws_ok(
  $$insert into public.transfer_events(
      tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,requested_on,status,initiated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001',
      'Receiving School',current_date,'requested','f6a00000-0000-4000-8000-000000000003'
    )$$,
  'Transfer initiator is not authorized for source school',
  'trusted path cannot forge an unrelated transfer initiator'
);

select throws_ok(
  $$insert into public.transfer_events(
      tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,requested_on,status,initiated_by_user_id,approved_by_user_id,approved_at
    ) values(
      '11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001',
      'Receiving School',current_date,'approved','f6a00000-0000-4000-8000-000000000001','f6a00000-0000-4000-8000-000000000001',now()
    )$$,
  'New transfer must begin in requested status',
  'trusted path cannot create an already-approved transfer'
);

select lives_ok(
  $$insert into public.transfer_events(
      id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,requested_on,status,initiated_by_user_id
    ) values(
      'f6a10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001',
      'Receiving School',current_date,'requested','f6a00000-0000-4000-8000-000000000001'
    )$$,
  'authorized source manager can create a requested transfer'
);

select throws_ok(
  $$update public.transfer_events
       set initiated_by_user_id='f6a00000-0000-4000-8000-000000000002'
     where id='f6a10000-0000-4000-8000-000000000001'$$,
  'Transfer initiator provenance is immutable',
  'transfer initiator cannot be rewritten after creation'
);

select throws_ok(
  $$update public.transfer_events
       set status='approved', approved_by_user_id='f6a00000-0000-4000-8000-000000000003', approved_at=now()
     where id='f6a10000-0000-4000-8000-000000000001'$$,
  'Transfer approver is not authorized for source school',
  'trusted path cannot forge an unrelated transfer approver'
);

select set_config('request.jwt.claim.sub','f6a00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.transfer_events(
      tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,requested_on,status,initiated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000002',
      'Client Receiving School',current_date,'requested','f6a00000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'new row violates row-level security policy for table "transfer_events"',
  'authenticated source manager cannot forge another user as initiator'
);

select throws_ok(
  $$insert into public.transfer_events(
      tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,requested_on,status,initiated_by_user_id,approved_by_user_id,approved_at
    ) values(
      '11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000002',
      'Client Receiving School',current_date,'approved','f6a00000-0000-4000-8000-000000000001','f6a00000-0000-4000-8000-000000000001',now()
    )$$,
  '42501',
  'new row violates row-level security policy for table "transfer_events"',
  'authenticated source manager cannot bypass approval by inserting approved state'
);

reset role;

select lives_ok(
  $$select public.approve_learner_transfer('f6a10000-0000-4000-8000-000000000001',current_date,'Approved normally')$$,
  'canonical approval RPC remains valid with actor guard'
);

select is(
  (select approved_by_user_id from public.transfer_events where id='f6a10000-0000-4000-8000-000000000001'),
  'f6a00000-0000-4000-8000-000000000001'::uuid,
  'canonical approval derives approver from authenticated actor'
);

select throws_ok(
  $$update public.transfer_events
       set approved_by_user_id='f6a00000-0000-4000-8000-000000000002'
     where id='f6a10000-0000-4000-8000-000000000001'$$,
  'Transfer approval actor provenance is immutable once recorded',
  'recorded transfer approver cannot later be rewritten to another authorized manager'
);

select is(
  (select count(*)::integer from public.transfer_events where id='f6a10000-0000-4000-8000-000000000001'),
  1,
  'valid requested transfer remains intact through governed approval'
);

select * from finish();
rollback;
