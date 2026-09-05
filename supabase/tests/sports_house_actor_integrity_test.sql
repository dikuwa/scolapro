begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fea00000-0000-4000-8000-000000000001','sports-actor-admin@example.test','authenticated','authenticated',now(),now()),
('fea00000-0000-4000-8000-000000000002','sports-actor-teacher@example.test','authenticated','authenticated',now(),now()),
('fea00000-0000-4000-8000-000000000003','sports-actor-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000002','teacher','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000003','principal','2026-01-01');

select lives_ok(
  $$insert into public.sports_houses(
      id,tenant_id,school_id,name,short_code,created_by_user_id
    ) values(
      'fea10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'Actor House A','AHA','fea00000-0000-4000-8000-000000000001'
    )$$,
  'trusted setup accepts a house creator with real school sports authority'
);

select throws_ok(
  $$insert into public.sports_houses(
      tenant_id,school_id,name,short_code,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'Forged Teacher House','FTH','fea00000-0000-4000-8000-000000000002'
    )$$,
  'Sports configuration creator is not authorized for school',
  'trusted writer cannot forge an ordinary teacher as house creator'
);

select throws_ok(
  $$insert into public.sports_houses(tenant_id,school_id,name)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Missing Creator')$$,
  'Sports configuration creator is required',
  'sports configuration cannot lose creator evidence'
);

select throws_ok(
  $$update public.sports_houses
    set created_by_user_id='fea00000-0000-4000-8000-000000000003'
    where id='fea10000-0000-4000-8000-000000000001'$$,
  'Sports configuration creator provenance is immutable',
  'house creator provenance cannot be rewritten even to another authorized leader'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.set_sports_year_settings(
    '22222222-2222-4222-8222-222222222222',2026,'2026-12-31','carry_forward',true,true,false
  )$$,
  'governed RPC still creates sports year settings for an authorized school admin'
);
select lives_ok(
  $$select public.upsert_sports_age_group(
    '22222222-2222-4222-8222-222222222222','Age 14',14,14,1,null
  )$$,
  'governed RPC still creates sports age groups'
);
select lives_ok(
  $$select public.upsert_sports_house(
    '22222222-2222-4222-8222-222222222222','Actor House B','AHB','#112233',2,null
  )$$,
  'governed RPC still creates another house'
);

reset role;

select throws_ok(
  $$update public.sports_year_settings
    set academic_year=2027,age_reference_date='2027-12-31'
    where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026$$,
  'Sports year settings academic year is immutable',
  'trusted writers cannot move annual sports settings to another year'
);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
('fea20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Actor','Sports Learner','2012-05-01','female');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('fea21000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea20000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('fea30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','SPORT-ACTOR-1','Actor','Sports Staff','active');
insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'fea31000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fea30000-0000-4000-8000-000000000001','teacher','2026-01-01','fea00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.assign_learner_sports_house(
    '22222222-2222-4222-8222-222222222222',2026,'fea20000-0000-4000-8000-000000000001',
    'fea10000-0000-4000-8000-000000000001','manual',false
  )$$,
  'authorized manager assigns a learner through the governed RPC'
);
select lives_ok(
  $$select public.assign_staff_sports_house(
    '22222222-2222-4222-8222-222222222222',2026,'fea30000-0000-4000-8000-000000000001',
    (select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Actor House B'),
    'member','manual',false
  )$$,
  'authorized manager assigns a placed staff member through the governed RPC'
);
select lives_ok(
  $$select public.assign_learner_sports_house(
    '22222222-2222-4222-8222-222222222222',2026,'fea20000-0000-4000-8000-000000000001',
    (select id from public.sports_houses where school_id='22222222-2222-4222-8222-222222222222' and name='Actor House B'),
    'manual',true
  )$$,
  'authorized manager can legitimately reassign and lock a learner assignment'
);
select is(
  (select assigned_by_user_id from public.sports_learner_house_assignments
   where learner_id='fea20000-0000-4000-8000-000000000001' and academic_year=2026),
  'fea00000-0000-4000-8000-000000000001'::uuid,
  'learner reassignment retains the authenticated manager actor evidence'
);

reset role;

select throws_ok(
  $$insert into public.sports_learner_house_assignments(
      tenant_id,school_id,academic_year,learner_id,house_id,assigned_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fea20000-0000-4000-8000-000000000001','fea10000-0000-4000-8000-000000000001','fea00000-0000-4000-8000-000000000002'
    )$$,
  'Sports house assignment actor is not authorized for school',
  'trusted writer cannot attribute a learner house assignment to an ordinary teacher'
);

select throws_ok(
  $$update public.sports_staff_house_assignments
    set assigned_by_user_id='fea00000-0000-4000-8000-000000000003'
    where staff_member_id='fea30000-0000-4000-8000-000000000001' and academic_year=2026$$,
  'Sports house assignment actor evidence may change only with the assignment',
  'trusted writer cannot rewrite assignment actor evidence without changing the assignment'
);

select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.assign_learner_sports_house(
    '22222222-2222-4222-8222-222222222222',2026,'fea20000-0000-4000-8000-000000000001',
    'fea10000-0000-4000-8000-000000000001','manual',false
  )$$,
  'Permission denied',
  'ordinary teacher remains unable to mutate sports house assignment through RPC'
);
reset role;

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_sports(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_sports(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_sports_configuration_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_sports_assignment_actor_integrity()','EXECUTE'),
  'sports actor integrity helpers remain private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid in (
     'public.sports_houses'::regclass,'public.sports_year_settings'::regclass,'public.sports_age_groups'::regclass,
     'public.sports_learner_house_assignments'::regclass,'public.sports_staff_house_assignments'::regclass
   ) and tgname in (
     'sports_house_creator_integrity_trg','sports_year_settings_creator_integrity_trg','sports_age_group_creator_integrity_trg',
     'sports_learner_house_actor_integrity_trg','sports_staff_house_actor_integrity_trg'
   ) and not tgisinternal),
  5,
  'all five Sports & Houses actor-integrity triggers are installed once'
);

select * from finish();
rollback;
