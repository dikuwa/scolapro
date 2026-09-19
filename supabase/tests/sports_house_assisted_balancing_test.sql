begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('55200000-0000-4000-8000-000000000001','sports-balance-admin@example.test','authenticated','authenticated',now(),now()),
('55200000-0000-4000-8000-000000000002','sports-balance-support@example.test','authenticated','authenticated',now(),now()),
('55200000-0000-4000-8000-000000000003','sports-balance-other@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('55210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Balance Other School','BAL-OTHER','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55200000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55200000-0000-4000-8000-000000000002','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','55210000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.platform_memberships(user_id,role_key,active_from) values
('55200000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.sports_houses(id,tenant_id,school_id,name,short_code,sort_order,status,created_by_user_id) values
('55220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Balance Alpha','BAL-A',1,'active','55200000-0000-4000-8000-000000000001'),
('55220000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Balance Beta','BAL-B',2,'active','55200000-0000-4000-8000-000000000001');

insert into public.sports_year_settings(
  tenant_id,school_id,academic_year,age_reference_date,assignment_continuity,
  balance_by_sex,balance_by_age_group,balance_by_grade,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'2026-12-31','rebalance_each_year',true,true,true,'55200000-0000-4000-8000-000000000001'
);

insert into public.sports_age_groups(id,tenant_id,school_id,label,min_age,max_age,sort_order,status,created_by_user_id) values
('55221000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Junior',10,13,1,'active','55200000-0000-4000-8000-000000000001'),
('55221000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Senior',14,18,2,'active','55200000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
('55230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Manual','Learner','2013-02-01','female'),
('55230000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Locked','Learner','2012-03-01','male'),
('55230000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Unlocked','Learner','2013-04-01','female'),
('55230000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Unassigned','Learner','2012-05-01','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('55231000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55230000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
('55231000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55230000-0000-4000-8000-000000000002',2026,'2026-01-01','current'),
('55231000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55230000-0000-4000-8000-000000000003',2026,'2026-01-01','current'),
('55231000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55230000-0000-4000-8000-000000000004',2026,'2026-01-01','current');

insert into public.sports_learner_house_assignments(
  tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id
) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55230000-0000-4000-8000-000000000001','55220000-0000-4000-8000-000000000001','manual',false,'55200000-0000-4000-8000-000000000001'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55230000-0000-4000-8000-000000000002','55220000-0000-4000-8000-000000000001','automatic',true,'55200000-0000-4000-8000-000000000001'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55230000-0000-4000-8000-000000000003','55220000-0000-4000-8000-000000000001','automatic',false,'55200000-0000-4000-8000-000000000001');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('55240000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','BAL-S1','Leader','Staff','active'),
('55240000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','BAL-S2','Manual','Staff','active'),
('55240000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','BAL-S3','Unlocked','Staff','active'),
('55240000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','BAL-S4','Unassigned','Staff','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('55241000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55240000-0000-4000-8000-000000000001','teacher','2026-01-01','55200000-0000-4000-8000-000000000001'),
('55241000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55240000-0000-4000-8000-000000000002','teacher','2026-01-01','55200000-0000-4000-8000-000000000001'),
('55241000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55240000-0000-4000-8000-000000000003','teacher','2026-01-01','55200000-0000-4000-8000-000000000001'),
('55241000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55240000-0000-4000-8000-000000000004','teacher','2026-01-01','55200000-0000-4000-8000-000000000001');

insert into public.sports_staff_house_assignments(
 tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_by_user_id
) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55240000-0000-4000-8000-000000000001','55220000-0000-4000-8000-000000000001','leader','manual',false,'55200000-0000-4000-8000-000000000001'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55240000-0000-4000-8000-000000000002','55220000-0000-4000-8000-000000000001','member','manual',false,'55200000-0000-4000-8000-000000000001'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'55240000-0000-4000-8000-000000000003','55220000-0000-4000-8000-000000000001','member','automatic',false,'55200000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55200000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.preview_sports_house_balancing(
    '22222222-2222-4222-8222-222222222222',2026,'learner','55250000-0000-4000-8000-000000000001'
  )$$,
  'manager can create a learner balancing preview'
);

select is(
  (select count(*)::integer from public.sports_learner_house_assignments where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026),
  3,
  'preview does not mutate canonical learner assignments'
);

select is(
  (select count(*)::integer from public.sports_house_balancing_moves m
   join public.sports_house_balancing_runs r on r.id=m.run_id
   where r.client_operation_id='55250000-0000-4000-8000-000000000001'
     and m.learner_id in ('55230000-0000-4000-8000-000000000001','55230000-0000-4000-8000-000000000002')),
  0,
  'manual and locked learner assignments are never proposed for movement'
);

select ok(
  (select count(*) from public.sports_house_balancing_moves m
   join public.sports_house_balancing_runs r on r.id=m.run_id
   where r.client_operation_id='55250000-0000-4000-8000-000000000001'
     and m.learner_id in ('55230000-0000-4000-8000-000000000003','55230000-0000-4000-8000-000000000004')) >= 1,
  'unassigned or explicitly unlocked learner assignments may be proposed'
);

select is(
  (select public.preview_sports_house_balancing(
    '22222222-2222-4222-8222-222222222222',2026,'learner','55250000-0000-4000-8000-000000000001'
  )),
  (select id from public.sports_house_balancing_runs where client_operation_id='55250000-0000-4000-8000-000000000001'),
  'preview replay with the same client operation ID is idempotent'
);

select lives_ok(
  $$select public.apply_sports_house_balancing(
    (select id from public.sports_house_balancing_runs where client_operation_id='55250000-0000-4000-8000-000000000001')
  )$$,
  'manager can atomically apply a fresh learner preview'
);

select is(
  (select house_id from public.sports_learner_house_assignments where learner_id='55230000-0000-4000-8000-000000000001' and academic_year=2026),
  '55220000-0000-4000-8000-000000000001'::uuid,
  'manual learner assignment remains unchanged after apply'
);

select is(
  (select house_id from public.sports_learner_house_assignments where learner_id='55230000-0000-4000-8000-000000000002' and academic_year=2026),
  '55220000-0000-4000-8000-000000000001'::uuid,
  'locked learner assignment remains unchanged after apply'
);

select ok(
  (select status='applied' and applied_by_user_id='55200000-0000-4000-8000-000000000001' and applied_at is not null
   from public.sports_house_balancing_runs where client_operation_id='55250000-0000-4000-8000-000000000001'),
  'applied run records actor and timestamp'
);

select lives_ok(
  $$select public.apply_sports_house_balancing(
    (select id from public.sports_house_balancing_runs where client_operation_id='55250000-0000-4000-8000-000000000001')
  )$$,
  'applied-run replay is finality-safe and idempotent'
);

select lives_ok(
  $$select public.preview_sports_house_balancing(
    '22222222-2222-4222-8222-222222222222',2026,'staff','55250000-0000-4000-8000-000000000002'
  )$$,
  'manager can create a separate staff balancing preview'
);

select is(
  (select count(*)::integer from public.sports_house_balancing_moves m
   join public.sports_house_balancing_runs r on r.id=m.run_id
   where r.client_operation_id='55250000-0000-4000-8000-000000000002'
     and m.staff_member_id in ('55240000-0000-4000-8000-000000000001','55240000-0000-4000-8000-000000000002')),
  0,
  'house leaders and manual staff assignments remain fixed'
);

select lives_ok(
  $$select public.apply_sports_house_balancing(
    (select id from public.sports_house_balancing_runs where client_operation_id='55250000-0000-4000-8000-000000000002')
  )$$,
  'staff balancing apply succeeds separately'
);

select is(
  (select role_key from public.sports_staff_house_assignments where staff_member_id='55240000-0000-4000-8000-000000000001' and academic_year=2026),
  'leader',
  'staff balancing preserves house leader role'
);

reset role;
select throws_ok(
  $update$
    update public.sports_house_balancing_runs
    set proposed_moves='[]'::jsonb
    where client_operation_id='55250000-0000-4000-8000-000000000001'
  $update$,
  'Sports balancing run provenance is immutable',
  'applied balancing run provenance cannot be rewritten by trusted direct DML'
);
set local role authenticated;

select ok(
  (select count(*) from public.audit_events
   where entity_type='sports_house_balancing_run'
     and event_type in ('sports.house_balance.previewed','sports.house_balance.applied')) >= 4,
  'preview and apply operations are audit recorded'
);

reset role;
select set_config('request.jwt.claim.sub','55200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.preview_sports_house_balancing(
    '22222222-2222-4222-8222-222222222222',2026,'learner','55250000-0000-4000-8000-000000000003'
  )$$,
  'Permission denied',
  'Platform Support cannot operate school balancing even with mixed school membership'
);
reset role;

select set_config('request.jwt.claim.sub','55200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.preview_sports_house_balancing(
    '22222222-2222-4222-8222-222222222222',2026,'learner','55250000-0000-4000-8000-000000000004'
  )$$,
  'Permission denied',
  'another school manager cannot cross the school balancing boundary'
);
reset role;

select ok(
  not has_function_privilege('anon','public.preview_sports_house_balancing(uuid,integer,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.apply_sports_house_balancing(uuid)','EXECUTE'),
  'balancing RPCs are unavailable to anonymous callers'
);

select * from finish();
rollback;
