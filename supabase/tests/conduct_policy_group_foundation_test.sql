begin;
select no_plan();

insert into auth.users(id,email,aud,role) values
('d1000000-0000-4000-8000-000000000001','conduct-group-principal@example.test','authenticated','authenticated'),
('d1000000-0000-4000-8000-000000000002','conduct-group-deputy@example.test','authenticated','authenticated'),
('d1000000-0000-4000-8000-000000000003','conduct-group-other@example.test','authenticated','authenticated');

insert into public.tenants(id,name,slug) values
('d1100000-0000-4000-8000-000000000001','Conduct Group Tenant A','conduct-group-a'),
('d1100000-0000-4000-8000-000000000002','Conduct Group Tenant B','conduct-group-b');

insert into public.schools(id,tenant_id,name,status) values
('d1200000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','Conduct Group School A','active'),
('d1200000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','Conduct Starter School','active'),
('d1200000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000002','Conduct Group School B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','principal',current_date-10),
('d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','deputy_principal',current_date-10),
('d1100000-0000-4000-8000-000000000002','d1200000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','principal',current_date-10);

insert into public.learners(id,tenant_id,first_names,surname) values
('d1300000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','Conduct','Learner');
insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-10,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.upsert_conduct_policy_group(
    'd1200000-0000-4000-8000-000000000001',null,'violation','LEVEL_X','Level X',-2,'moderate',10,true
  )$$,
  'principal can create a configurable violation group'
);

select lives_ok(
  $$select public.upsert_conduct_policy_group(
    'd1200000-0000-4000-8000-000000000001',null,'recognition','GENERAL_X','General X',3,null,20,true
  )$$,
  'principal can create a configurable recognition group'
);

select is(
  (select count(*)::integer from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001'),
  2,
  'groups are school-scoped'
);

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.upsert_conduct_policy_category(
    'd1200000-0000-4000-8000-000000000001',
    null,
    (select id from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001' and code='LEVEL_X'),
    'conduct','negative','TEST_ITEM','Test violation','moderate',-2,false,10,true
  )$$,
  'deputy principal can manage conduct policy deliberately'
);

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.create_conduct_event_group(
    'd1200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000001' and code='TEST_ITEM'),
    null,'Test violation',null,current_date,
    array['d1300000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'grouped policy item records through existing canonical event flow'
);

select is(
  (select category_snapshot#>>'{group,display_name}' from public.conduct_events where summary='Test violation'),
  'Level X',
  'recorded event freezes group display meaning'
);
select is(
  (select category_snapshot->>'points' from public.conduct_events where summary='Test violation'),
  '-2',
  'recorded event freezes item points'
);

select lives_ok(
  $$select public.upsert_conduct_policy_group(
    'd1200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001' and code='LEVEL_X'),
    'violation','LEVEL_X','Renamed Level',-4,'critical',10,true
  )$$,
  'group can be edited after use'
);
select is(
  (select category_snapshot#>>'{group,display_name}' from public.conduct_events where summary='Test violation'),
  'Level X',
  'later group edits do not rewrite historical event meaning'
);

select throws_ok(
  $$select public.delete_unused_conduct_policy_category(
    (select id from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000001' and code='TEST_ITEM')
  )$$,
  'Conduct item has historical references; archive it instead',
  'used items cannot be destructively deleted'
);

select throws_ok(
  $$select public.delete_unused_conduct_policy_group(
    (select id from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001' and code='LEVEL_X')
  )$$,
  'Conduct group has historical references; archive it instead',
  'used groups cannot be destructively deleted'
);

select lives_ok(
  $$select public.upsert_conduct_policy_category(
    'd1200000-0000-4000-8000-000000000001',
    null,
    (select id from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001' and code='GENERAL_X'),
    'conduct','positive','UNUSED_ITEM','Unused recognition',null,3,false,10,true
  )$$,
  'unused policy item can be created'
);
select lives_ok(
  $$select public.delete_unused_conduct_policy_category(
    (select id from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000001' and code='UNUSED_ITEM')
  )$$,
  'unused policy item can be permanently deleted'
);

select lives_ok(
  $$select public.retire_conduct_policy_group(
    (select id from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000001' and code='LEVEL_X')
  )$$,
  'used group can be archived'
);
select throws_ok(
  $$select public.create_conduct_event_group(
    'd1200000-0000-4000-8000-000000000001',
    (select id from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000001' and code='TEST_ITEM'),
    null,'Archived group event',null,current_date,
    array['d1300000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'Category is not active in this school and domain',
  'archived group cannot be used for new events'
);

reset role;
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','principal',current_date);
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.ensure_conduct_starter_policy('d1200000-0000-4000-8000-000000000002')$$,
  'starter policy can be created for an empty school'
);
select is(
  (select count(*)::integer from public.conduct_policy_groups where school_id='d1200000-0000-4000-8000-000000000002'),
  6,
  'starter policy creates six editable groups'
);
select is(
  (select count(*)::integer from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000002'),
  43,
  'starter policy creates the supplied editable conduct items'
);
select lives_ok(
  $$select public.ensure_conduct_starter_policy('d1200000-0000-4000-8000-000000000002')$$,
  'starter policy seeding is idempotent'
);
select is(
  (select count(*)::integer from public.conduct_policy_categories where school_id='d1200000-0000-4000-8000-000000000002'),
  43,
  'idempotent starter setup does not duplicate items'
);

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.conduct_policy_groups),
  0,
  'other tenant cannot read conduct groups'
);
select throws_ok(
  $$select public.ensure_conduct_starter_policy('d1200000-0000-4000-8000-000000000002')$$,
  '42501',
  'Permission denied',
  'other tenant cannot provision another school policy'
);

select ok(
  not has_table_privilege('authenticated','public.conduct_policy_groups','INSERT,UPDATE,DELETE'),
  'clients cannot bypass conduct group management RPCs'
);
select ok(
  not has_table_privilege('authenticated','public.conduct_policy_categories','INSERT,UPDATE,DELETE'),
  'clients cannot bypass conduct item management RPCs'
);

reset role;
select * from finish();
rollback;
