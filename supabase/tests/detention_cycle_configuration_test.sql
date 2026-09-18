begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('49300000-0000-4000-8000-000000000001','cycle-admin@example.test','authenticated','authenticated',now(),now()),
  ('49300000-0000-4000-8000-000000000002','cycle-stale@example.test','authenticated','authenticated',now(),now()),
  ('49300000-0000-4000-8000-000000000003','cycle-other@example.test','authenticated','authenticated',now(),now()),
  ('49300000-0000-4000-8000-000000000004','cycle-support@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values(
  '49310000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Cycle Other School','CYCLE-OTHER','Khomas','Windhoek','active'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('49320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',null,'CYCLE-SUP','Cycle','Supervisor','active'),
  ('49320000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','49300000-0000-4000-8000-000000000002','CYCLE-STALE','Stale','Leader','active');

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('49330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49300000-0000-4000-8000-000000000001',null,'school_admin',current_date-30),
  ('49330000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49300000-0000-4000-8000-000000000002','49320000-0000-4000-8000-000000000002','school_admin',current_date-30),
  ('49330000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','49310000-0000-4000-8000-000000000001','49300000-0000-4000-8000-000000000003',null,'school_admin',current_date-30),
  ('49330000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49300000-0000-4000-8000-000000000004',null,'school_admin',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('49300000-0000-4000-8000-000000000004','platform_support',current_date-30);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('49340000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49320000-0000-4000-8000-000000000001','teacher',current_date-30,null,'49300000-0000-4000-8000-000000000001'),
  ('49340000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49320000-0000-4000-8000-000000000002','teacher',current_date-60,current_date-1,'49300000-0000-4000-8000-000000000001');

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,status,notes,created_by_user_id,completed_by_user_id,completed_at
) values(
  '49350000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  current_date-30,'14:00','15:00','completed','Historical cycle session',
  '49300000-0000-4000-8000-000000000001',
  '49300000-0000-4000-8000-000000000001',
  now()-interval '30 days'
);

set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','49300000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','configured_days',array[5]::smallint[]
  )$$,
  'current-school leadership can configure a single detention day'
);

select is(
  (select detention_weekdays from public.school_late_arrival_policies where school_id='22222222-2222-4222-8222-222222222222'),
  array[5]::smallint[],
  'single-day configuration is stored on the existing school policy row'
);

reset role;
select is(
  app_private.next_detention_cycle_date('2026-09-17','configured_days',array[5]::smallint[],5::smallint),
  '2026-09-18'::date,
  'single-day cycle resolves the next configured detention date'
);
set local role authenticated;

select lives_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','configured_days',array[5,2,5]::smallint[]
  )$$,
  'leadership can configure multiple detention days'
);

select is(
  (select detention_weekdays from public.school_late_arrival_policies where school_id='22222222-2222-4222-8222-222222222222'),
  array[2,5]::smallint[],
  'multi-day configuration is normalised and deduplicated'
);

reset role;
select is(
  app_private.next_detention_cycle_date('2026-09-18','configured_days',array[2,5]::smallint[],5::smallint),
  '2026-09-22'::date,
  'multi-day cycle selects the nearest later configured day'
);
set local role authenticated;

select lives_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','manual',null
  )$$,
  'leadership can switch detention scheduling to manual/ad-hoc mode'
);

select is(
  (select detention_schedule_mode from public.school_late_arrival_policies where school_id='22222222-2222-4222-8222-222222222222'),
  'manual',
  'manual scheduling mode is persisted'
);

reset role;
select is(
  app_private.next_detention_cycle_date('2026-09-18','manual',null,5::smallint),
  '2026-09-18'::date,
  'manual mode makes a new obligation immediately eligible for authorised scheduling'
);
set local role authenticated;

select lives_ok(
  $$select public.create_detention_session_plan(
    '22222222-2222-4222-8222-222222222222',
    current_date+17,'14:00'::time,'15:00'::time,'Room 14',
    'Issue 493 manual future session',
    array['49320000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'manual mode still permits authorised future-session creation on the canonical session model'
);

select is(
  (select session_date from public.detention_sessions where id='49350000-0000-4000-8000-000000000001'),
  current_date-30,
  'cycle configuration changes do not rewrite historical detention sessions'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','49300000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','configured_days',array[3]::smallint[]
  )$$,
  'P0001','Permission denied',
  'stale staff placement cannot retain detention configuration authority'
);

reset role;
select set_config('request.jwt.claim.sub','49300000-0000-4000-8000-000000000003',true);
set local role authenticated;

select throws_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','configured_days',array[4]::smallint[]
  )$$,
  'P0001','Permission denied',
  'another current school cannot configure this school detention cycle'
);

reset role;
select set_config('request.jwt.claim.sub','49300000-0000-4000-8000-000000000004',true);
set local role authenticated;

select throws_ok(
  $$select public.update_detention_cycle_configuration(
    '22222222-2222-4222-8222-222222222222','configured_days',array[1]::smallint[]
  )$$,
  'P0001','Permission denied',
  'Platform Support remains outside school-operational detention configuration'
);

reset role;

select is(
  (select count(*)::integer from public.school_late_arrival_events where recorded_by_user_id in (
    '49300000-0000-4000-8000-000000000001',
    '49300000-0000-4000-8000-000000000002',
    '49300000-0000-4000-8000-000000000003',
    '49300000-0000-4000-8000-000000000004'
  )),
  0,
  'detention cycle configuration does not mutate school attendance or late-arrival event data'
);

select * from finish();
rollback;
