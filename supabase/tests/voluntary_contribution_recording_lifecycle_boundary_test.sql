begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f8700000-0000-4000-8000-000000000001','contribution-lifecycle-boundary@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8700000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.sub','f8700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.create_voluntary_contribution_campaign(
  '22222222-2222-4222-8222-222222222222',2026,'Lifecycle draft boundary',null,current_date-1,current_date+10,true
);
select public.add_voluntary_contribution_item(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle draft boundary'),
  'goods','Draft books',null,'book',1,null,10
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution(
    '50000000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Draft books'),
    current_date,1,null,'Must reject draft',null
  )$$,
  'Contribution campaign is not open for recording',
  'draft campaign cannot accept learner contributions'
);

select public.publish_voluntary_contribution_campaign(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle draft boundary')
);

select lives_ok(
  $$select public.record_learner_voluntary_contribution(
    '50000000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Draft books'),
    current_date,1,null,'Published valid contribution',null
  )$$,
  'published in-period campaign accepts contribution for matching academic-year enrolment'
);

select is(
  (select e.academic_year
     from public.learner_voluntary_contributions r
     join public.enrolments e on e.id=r.enrolment_id
    where r.note='Published valid contribution'),
  2026,
  'recorded contribution is bound to enrolment from campaign academic year'
);

select public.create_voluntary_contribution_campaign(
  '22222222-2222-4222-8222-222222222222',2026,'Lifecycle future boundary',null,current_date+5,current_date+10,true
);
select public.add_voluntary_contribution_item(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle future boundary'),
  'goods','Future books',null,'book',1,null,10
);
select public.publish_voluntary_contribution_campaign(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle future boundary')
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution(
    '50000000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Future books'),
    current_date,1,null,'Too early',null
  )$$,
  'Contribution date is outside the campaign period',
  'published campaign cannot accept a contribution before its start date'
);

select public.create_voluntary_contribution_campaign(
  '22222222-2222-4222-8222-222222222222',2026,'Lifecycle expired boundary',null,current_date-10,current_date-5,true
);
select public.add_voluntary_contribution_item(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle expired boundary'),
  'goods','Expired books',null,'book',1,null,10
);
select public.publish_voluntary_contribution_campaign(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle expired boundary')
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution(
    '50000000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Expired books'),
    current_date,1,null,'Too late',null
  )$$,
  'Contribution date is outside the campaign period',
  'published campaign cannot accept a contribution after its end date'
);

select public.create_voluntary_contribution_campaign(
  '22222222-2222-4222-8222-222222222222',2027,'Lifecycle year boundary',null,current_date-1,current_date+10,true
);
select public.add_voluntary_contribution_item(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle year boundary'),
  'goods','Year books',null,'book',1,null,10
);
select public.publish_voluntary_contribution_campaign(
  (select id from public.voluntary_contribution_campaigns where title='Lifecycle year boundary')
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution(
    '50000000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Year books'),
    current_date,1,null,'Wrong academic year',null
  )$$,
  'Learner is not currently enrolled in this campaign year and school',
  'campaign cannot bind a learner contribution to an enrolment from another academic year'
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution_idempotent(
    'f8800000-0000-4000-8000-000000000001',
    (select id from public.voluntary_contribution_items where label='Year books'),
    '50000000-0000-4000-8000-000000000001',
    current_date,1,null,'Wrong academic year through idempotent path'
  )$$,
  'Learner is not currently enrolled in this campaign year and school',
  'idempotent recording path preserves the campaign-year boundary'
);

select is(
  (select count(*)::integer
     from public.client_operation_receipts
    where client_operation_id='f8800000-0000-4000-8000-000000000001'),
  0,
  'failed idempotent contribution does not leave an incomplete receipt'
);

select * from finish();
rollback;
