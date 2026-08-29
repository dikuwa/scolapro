begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe000000-0000-4000-8000-000000000001','contribution-admin@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','contribution-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000002','CONTRIB-CLASS-001','Contribution','Teacher','active'
);

update public.register_classes
set register_teacher_staff_id='fe100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001',null,'school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','class_teacher',current_date);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.create_voluntary_contribution_campaign('22222222-2222-4222-8222-222222222222',2026,'Classroom support','Voluntary paper and fundraising support',current_date-1,current_date+30,true)$$,
  'school administrator can create a voluntary contribution campaign'
);

select lives_ok(
  $$select public.add_voluntary_contribution_item((select id from public.voluntary_contribution_campaigns where title='Classroom support'),'goods','Ream of paper','Optional classroom paper','ream',1,null,10)$$,
  'school administrator can add a goods contribution item'
);

select lives_ok(
  $$select public.add_voluntary_contribution_item((select id from public.voluntary_contribution_campaigns where title='Classroom support'),'money','Raffle contribution','Optional fundraising contribution',null,null,100,20)$$,
  'school administrator can add a monetary contribution item'
);

select lives_ok(
  $$select public.publish_voluntary_contribution_campaign((select id from public.voluntary_contribution_campaigns where title='Classroom support'))$$,
  'campaign can be published after at least one contribution item exists'
);

select is(
  (select bool_or(required_for_all) from public.voluntary_contribution_items where campaign_id=(select id from public.voluntary_contribution_campaigns where title='Classroom support')),
  false,
  'published contribution items remain explicitly non-compulsory'
);

select throws_ok(
  $$insert into public.voluntary_contribution_items(tenant_id,school_id,campaign_id,item_type,label,required_for_all) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',(select id from public.voluntary_contribution_campaigns where title='Classroom support'),'goods','Compulsory item',true)$$,
  '23514',
  null,
  'database prevents a voluntary campaign item from being marked compulsory'
);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);

select lives_ok(
  $$select public.record_learner_voluntary_contribution('50000000-0000-4000-8000-000000000001',(select id from public.voluntary_contribution_items where label='Ream of paper'),current_date,2,null,'Received by class teacher',null)$$,
  'assigned class teacher can record a goods contribution against own class learner'
);

select lives_ok(
  $$select public.record_learner_voluntary_contribution('50000000-0000-4000-8000-000000000001',(select id from public.voluntary_contribution_items where label='Raffle contribution'),current_date,null,100,'Cash received',null)$$,
  'assigned class teacher can record a monetary contribution against own class learner'
);

select throws_ok(
  $$select public.record_learner_voluntary_contribution('50000000-0000-4000-8000-000000000002',(select id from public.voluntary_contribution_items where label='Ream of paper'),current_date,1,null,'Wrong class',null)$$,
  'Permission denied',
  'class teacher cannot record a contribution for learner outside assigned register class'
);

select is(
  (select count(*)::integer from public.learner_voluntary_contributions where learner_id='50000000-0000-4000-8000-000000000001'),
  2,
  'goods and money are retained as separate learner contribution records'
);

select is(
  (select count(*)::integer from public.audit_events where actor_user_id='fe000000-0000-4000-8000-000000000002' and event_type='voluntary_contribution.recorded'),
  2,
  'each teacher-recorded contribution is auditable'
);

select * from finish();
rollback;