begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('ff000000-0000-4000-8000-000000000001','offline-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.voluntary_contribution_campaigns(
  id,tenant_id,school_id,academic_year,title,status,created_by_user_id
) values(
  'ff100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'Offline Retry Test','published','ff000000-0000-4000-8000-000000000001'
);
insert into public.voluntary_contribution_items(
  id,tenant_id,school_id,campaign_id,item_type,label,suggested_amount,active
) values(
  'ff200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff100000-0000-4000-8000-000000000001','money','Test amount',10,true
);

select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.record_learner_voluntary_contribution_idempotent('ff300000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date,null,10,'offline retry')$$,
  'first offline contribution operation is recorded'
);

select is(
  (select count(*)::integer from public.learner_voluntary_contributions where item_id='ff200000-0000-4000-8000-000000000001'),
  1,
  'first operation creates one contribution'
);

select is(
  (select public.record_learner_voluntary_contribution_idempotent('ff300000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date,null,10,'offline retry')),
  (select id from public.learner_voluntary_contributions where item_id='ff200000-0000-4000-8000-000000000001'),
  'replaying the same client operation returns the original contribution ID'
);

select is(
  (select count(*)::integer from public.learner_voluntary_contributions where item_id='ff200000-0000-4000-8000-000000000001'),
  1,
  'retry does not duplicate the contribution'
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution_idempotent('ff300000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date,null,20,'offline retry')$$,
  'Client operation ID was already used with different contribution data',
  'a reused operation key with changed payload is rejected'
);

select * from finish();
rollback;