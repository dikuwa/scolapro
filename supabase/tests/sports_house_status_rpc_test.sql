begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('53600000-0000-4000-8000-000000000001','sports-phase1-admin@example.test','authenticated','authenticated',now(),now()),
('53600000-0000-4000-8000-000000000002','sports-phase1-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53600000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53600000-0000-4000-8000-000000000002','teacher',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','53600000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.upsert_sports_house(
    '22222222-2222-4222-8222-222222222222','Phase 1 House','P1H',null,1,null
  )$$,
  'authorized manager creates canonical house'
);

select lives_ok(
  $$select public.set_sports_house_status(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Phase 1 House'),
    'inactive'
  )$$,
  'authorized manager can deactivate a canonical house'
);

select is(
  (select status from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Phase 1 House'),
  'inactive',
  'house activation state is stored on the existing canonical row'
);

select throws_ok(
  $$select public.set_sports_house_status(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Phase 1 House'),
    'archived'
  )$$,
  'House status must be active or inactive',
  'Phase 1 status RPC does not expose archive semantics'
);

select set_config('request.jwt.claim.sub','53600000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$select public.set_sports_house_status(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Phase 1 House'),
    'active'
  )$$,
  'Permission denied',
  'ordinary teacher remains read-only'
);

reset role;

select ok(
  exists(
    select 1 from public.audit_events
    where event_type='sports.house.status_changed'
      and entity_type='sports_house'
      and actor_user_id='53600000-0000-4000-8000-000000000001'
      and metadata->>'status'='inactive'
  ),
  'house status change records actor/time through canonical audit event'
);

select * from finish();
rollback;
