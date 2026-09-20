begin;

select plan(16);

select has_function(
  'public','assign_learners_sports_house',array['uuid','integer','uuid[]','uuid','text','boolean']::text[],
  'manual learner multi-select RPC exists'
);
select ok(
  position('for update' in pg_get_functiondef(to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)'))) > 0
  and position('if v_existing.is_locked' in pg_get_functiondef(to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)'))) > position('for update' in pg_get_functiondef(to_regprocedure('public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean)'))),
  'per-learner locked recheck follows the row lock before the upsert'
);

insert into public.schools(id,tenant_id,name,status) values
('f5881000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Manual Multi-select School','active'),
('f5881000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other Sports School','active');
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f5880000-0000-4000-8000-000000000001','sports-multiselect-admin@example.test','authenticated','authenticated',now(),now()),
('f5880000-0000-4000-8000-000000000002','sports-multiselect-other-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','f5881000-0000-4000-8000-000000000001','f5880000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','f5881000-0000-4000-8000-000000000002','f5880000-0000-4000-8000-000000000002','school_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f5880000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.upsert_sports_house('f5881000-0000-4000-8000-000000000001','Red','RED','#AA0000',1,null)$$,
  'authorized manager creates the first test house'
);
select lives_ok(
  $$select public.upsert_sports_house('f5881000-0000-4000-8000-000000000001','Blue','BLU','#0000AA',2,null)$$,
  'authorized manager creates the second test house'
);
reset role;

select set_config('request.jwt.claim.sub','f5880000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$select public.upsert_sports_house('f5881000-0000-4000-8000-000000000002','Other','OTH','#008800',1,null)$$,
  'other-school manager creates the cross-school test house'
);
reset role;
insert into public.learners(id,tenant_id,first_names,surname) values
('f5883000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','One','Learner'),
('f5883000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Two','Learner'),
('f5883000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Other','School');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('f5884000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5881000-0000-4000-8000-000000000001','f5883000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
('f5884000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f5881000-0000-4000-8000-000000000001','f5883000-0000-4000-8000-000000000002',2026,'2026-01-01','current'),
('f5884000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','f5881000-0000-4000-8000-000000000002','f5883000-0000-4000-8000-000000000003',2026,'2026-01-01','current');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f5880000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,
    array['f5883000-0000-4000-8000-000000000001','f5883000-0000-4000-8000-000000000002']::uuid[],
    (select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red'),'manual',false),
  2,
  'one manual apply assigns all selected learners'
);
select is(
  (select count(*)::integer from public.sports_learner_house_assignments where school_id='f5881000-0000-4000-8000-000000000001' and academic_year=2026 and house_id=(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red')),
  2,
  'multi-select writes remain in the canonical assignment store'
);
select lives_ok(
  $$select public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,array['f5883000-0000-4000-8000-000000000001','f5883000-0000-4000-8000-000000000001']::uuid[],(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red'),'manual',false)$$,
  'duplicate learner selection is accepted idempotently'
);
select is(
  (select count(*)::integer from public.sports_learner_house_assignments where school_id='f5881000-0000-4000-8000-000000000001' and academic_year=2026),
  2,
  'duplicate selection does not create duplicate assignments'
);
select lives_ok(
  $$select public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,array['f5883000-0000-4000-8000-000000000001']::uuid[],(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red'),'manual',true)$$,
  'selected assignment can be explicitly locked'
);
select throws_ok(
  $$select public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,array['f5883000-0000-4000-8000-000000000001','f5883000-0000-4000-8000-000000000002']::uuid[],(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Blue'),'manual',false)$$,
  'P0001','Locked learner assignment cannot be moved','locked assignments block the whole batch rather than moving silently'
);
select is(
  (select house_id from public.sports_learner_house_assignments where learner_id='f5883000-0000-4000-8000-000000000001' and academic_year=2026),
  (select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red')::uuid,
  'failed locked batch leaves the locked assignment unchanged'
);
select is(
  (select is_locked from public.sports_learner_house_assignments where learner_id='f5883000-0000-4000-8000-000000000001' and academic_year=2026),
  true,
  'locked state is never silently cleared'
);
select throws_ok(
  $$select public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,array['f5883000-0000-4000-8000-000000000003']::uuid[],(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000001' and name='Red'),'manual',false)$$,
  'P0001','Learner must have an enrolment at the school for the sports year','cross-school learner cannot be assigned'
);
select throws_ok(
  $$select public.assign_learners_sports_house('f5881000-0000-4000-8000-000000000001',2026,array['f5883000-0000-4000-8000-000000000001']::uuid[],(select id from public.sports_houses where school_id='f5881000-0000-4000-8000-000000000002' and name='Other'),'manual',false)$$,
  'P0001','Sports house must be active in this school','cross-school house cannot be assigned'
);
select is(
  (select count(*)::integer from public.sports_learner_house_assignments where school_id='f5881000-0000-4000-8000-000000000001' and academic_year=2027),
  0,
  'assignment rows remain year scoped'
);

select * from finish();
rollback;
