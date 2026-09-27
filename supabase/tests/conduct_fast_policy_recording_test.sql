begin;
select no_plan();

insert into auth.users(id,email,aud,role) values
('d3000000-0000-4000-8000-000000000001','conduct-fast-principal@example.test','authenticated','authenticated');
insert into public.tenants(id,name,slug) values
('d3100000-0000-4000-8000-000000000001','Conduct Fast Tenant','conduct-fast');
insert into public.schools(id,tenant_id,name,status) values
('d3200000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000001','Conduct Fast School','active');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d3100000-0000-4000-8000-000000000001','d3200000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','principal',current_date-10);
insert into public.learners(id,tenant_id,first_names,surname) values
('d3300000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000001','Fast','One'),
('d3300000-0000-4000-8000-000000000002','d3100000-0000-4000-8000-000000000001','Fast','Two');
insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('d3100000-0000-4000-8000-000000000001','d3200000-0000-4000-8000-000000000001','d3300000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-5,'current'),
('d3100000-0000-4000-8000-000000000001','d3200000-0000-4000-8000-000000000001','d3300000-0000-4000-8000-000000000002',extract(year from current_date)::integer,current_date-5,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.ensure_conduct_starter_policy('d3200000-0000-4000-8000-000000000001')$$,'starter policy available');

select lives_ok(
  $$select public.record_conduct_policy_item_group(
    'd3200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d3200000-0000-4000-8000-000000000001' and code='REC_GEN_05'),
    'recognition',current_date,'Helped another learner',
    array['d3300000-0000-4000-8000-000000000001','d3300000-0000-4000-8000-000000000002','d3300000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'recognition records multiple learners through canonical grouped event flow'
);
select is((select count(*)::integer from public.conduct_events where summary='Helpfulness'),2,'policy item supplies recognition title and duplicate learner ids normalize');
select ok((select bool_and(direction='positive' and severity='routine') from public.conduct_events where summary='Helpfulness'),'recognition direction and severity come from policy');
select is((select count(distinct event_group_id)::integer from public.conduct_events where summary='Helpfulness'),1,'multi-learner recognition remains grouped');

select lives_ok(
  $$select public.record_conduct_policy_item_group(
    'd3200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d3200000-0000-4000-8000-000000000001' and code='VIO_L2_03'),
    'violation',current_date,'Playground incident',
    array['d3300000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'violation records through canonical conduct table'
);
select is((select summary from public.conduct_events where summary='Fighting / instigating' limit 1),'Fighting / instigating','policy item supplies violation title');
select is((select severity from public.conduct_events where summary='Fighting / instigating' limit 1),'serious','violation severity derives from policy item');
select is((select details from public.conduct_events where summary='Fighting / instigating' limit 1),'Playground incident','optional note is preserved');

select throws_ok(
  $$select public.record_conduct_policy_item_group(
    'd3200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d3200000-0000-4000-8000-000000000001' and code='VIO_L2_03'),
    'recognition',current_date,null,
    array['d3300000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'Conduct item does not match the selected type',
  'type group item mismatch is rejected'
);

select throws_ok(
  $$select public.record_conduct_policy_item_group(
    'd3200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d3200000-0000-4000-8000-000000000001' and code='REC_GEN_05'),
    'recognition',current_date+1,null,
    array['d3300000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'Check event date and text',
  'future event date remains rejected'
);

reset role;
select * from finish();
rollback;
