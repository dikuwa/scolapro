begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f8000000-0000-4000-8000-000000000001','contribution-leader@example.test','authenticated','authenticated',now(),now()),
  ('f8000000-0000-4000-8000-000000000002','contribution-class@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8000000-0000-4000-8000-000000000002','class_teacher',current_date);

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.create_voluntary_contribution_campaign(
  '22222222-2222-4222-8222-222222222222',2026,'Lifecycle support',null,current_date-1,current_date+7,true
);

select public.add_voluntary_contribution_item(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle support'),
  'goods','Exercise books',null,'book',2,null,10
);

select public.publish_voluntary_contribution_campaign(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle support')
);

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000002',true);

select public.record_learner_voluntary_contribution(
  '50000000-0000-4000-8000-000000000001',
  (select id from public.voluntary_contribution_items where label='Exercise books'),
  current_date,2,null,'Two books received',null
);

select throws_ok(
  $$select public.verify_learner_voluntary_contribution((select id from public.learner_voluntary_contributions where note='Two books received'))$$,
  'Permission denied',
  'class teacher who records a contribution cannot self-verify leadership review'
);

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000001',true);

select is(
  public.verify_learner_voluntary_contribution((select id from public.learner_voluntary_contributions where note='Two books received')),
  true,
  'school leader can verify a recorded voluntary contribution'
);

select is(
  (select status from public.learner_voluntary_contributions where note='Two books received'),
  'verified',
  'verification records the verified lifecycle state'
);

select ok(
  (select verified_by_user_id='f8000000-0000-4000-8000-000000000001' and verified_at is not null from public.learner_voluntary_contributions where note='Two books received'),
  'verification preserves leader and timestamp provenance'
);

select throws_ok(
  $$select public.reverse_learner_voluntary_contribution((select id from public.learner_voluntary_contributions where note='Two books received'),'   ')$$,
  'Reversal note is required',
  'reversal requires an explicit correction reason'
);

select is(
  public.reverse_learner_voluntary_contribution((select id from public.learner_voluntary_contributions where note='Two books received'),'Duplicate school record'),
  true,
  'school leader can reverse an incorrect contribution with reason'
);

select is(
  (select status from public.learner_voluntary_contributions where note='Two books received'),
  'reversed',
  'reversal moves the contribution to a terminal reversed state'
);

select ok(
  (select reversed_by_user_id='f8000000-0000-4000-8000-000000000001' and reversed_at is not null and reversal_note='Duplicate school record' from public.learner_voluntary_contributions where note='Two books received'),
  'reversal preserves actor, timestamp and reason'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='learner_voluntary_contribution' and entity_id=(select id from public.learner_voluntary_contributions where note='Two books received') and event_type in ('voluntary_contribution.verified','voluntary_contribution.reversed')),
  2,
  'verification and reversal each create durable audit events'
);

select * from finish();
rollback;