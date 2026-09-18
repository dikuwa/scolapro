begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd000000-0000-4000-8000-000000000001','roster-coordinator@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','roster-teacher-a@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','roster-teacher-b@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000004','roster-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000005','roster-other-school@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fd900000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Roster Other School','ROSTER-OTHER','Erongo','Walvis Bay','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('fd010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('fd010000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd900000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000005','school_admin',current_date-30);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000002','ROSTER-A','Roster','Teacher A','active'),
  ('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000003','ROSTER-B','Roster','Teacher B','active'),
  ('fd100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000004','ROSTER-X','Roster','Unrelated','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fd110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','teacher',current_date-30,current_date+40,'fd000000-0000-4000-8000-000000000001'),
  ('fd110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000002','teacher',current_date-30,current_date+16,'fd000000-0000-4000-8000-000000000001'),
  ('fd110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000003','teacher',current_date-30,current_date+40,'fd000000-0000-4000-8000-000000000001');

set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_detention_session_plan(
    '22222222-2222-4222-8222-222222222222'::uuid,current_date+14,'14:00'::time,'15:00'::time,
    'Room 21','Issue 486 advance roster',
    array['fd100000-0000-4000-8000-000000000001'::uuid,'fd100000-0000-4000-8000-000000000002'::uuid]
  )$$,
  'coordinator can plan a multi-teacher duty session before learners exist'
);

select is(
  (select count(*) from public.detention_session_items dsi join public.detention_sessions ds on ds.id=dsi.detention_session_id where ds.notes='Issue 486 advance roster'),
  0::bigint,
  'advance duty roster exists with no learner obligations attached'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select learner_count from public.list_my_upcoming_detention_sessions() where session_id=(select id from public.detention_sessions where notes='Issue 486 advance roster')),
  0::bigint,
  'rostered teacher sees upcoming duty before learners are attached'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_upcoming_detention_sessions() where session_id=(select id from public.detention_sessions where notes='Issue 486 advance roster')),
  1,
  'second duty teacher sees the same planned session'
);

reset role;
set local session_replication_role = replica;
insert into public.learners(id,tenant_id,first_names,surname)
values('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Roster','Learner');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fd210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd200000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-30,'current');
insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on
) values(
  'fd220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fd200000-0000-4000-8000-000000000001',3,current_date+7,'pending',extract(year from current_date)::integer,current_date,current_date+7
);
set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.assign_detention_session_learners(
    (select id from public.detention_sessions where notes='Issue 486 advance roster'),
    array['fd220000-0000-4000-8000-000000000001'::uuid],
    'fd100000-0000-4000-8000-000000000002'::uuid
  ),
  1,
  'learner can be attached later to the existing duty session'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is(
  (select learner_count from public.list_my_upcoming_detention_sessions() where session_id=(select id from public.detention_sessions where notes='Issue 486 advance roster')),
  1::bigint,
  'later learner attachment updates the same upcoming duty context'
);

reset role;
select is(
  (select count(*) from public.notifications where recipient_user_id='fd000000-0000-4000-8000-000000000003' and title='Detention learners assigned'),
  1::bigint,
  'learner-assignment notification targets the responsible rostered teacher'
);
select is(
  (select count(*) from public.notifications where recipient_user_id='fd000000-0000-4000-8000-000000000004' and title like 'Detention%'),
  0::bigint,
  'unrelated teacher receives no detention roster notifications'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.reschedule_detention_session_plan(
    (select id from public.detention_sessions where notes='Issue 486 advance roster'),
    current_date+15,'13:30'::time,'14:30'::time,'Room 22'
  )$$,
  'future roster can be rescheduled without creating a second session'
);

select throws_ok(
  $$select public.reschedule_detention_session_plan(
    (select id from public.detention_sessions where notes='Issue 486 advance roster'),
    current_date+20,'13:30'::time,'14:30'::time,'Room 22'
  )$$,
  'A selected supervisor is not assigned to this school on the rescheduled detention date',
  'stale teacher placement blocks future roster rescheduling'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000005',true);
set local role authenticated;

select throws_ok(
  $$select public.reschedule_detention_session_plan(
    (select id from public.detention_sessions where notes='Issue 486 advance roster'),
    current_date+15,'13:30'::time,'14:30'::time,'Room 23'
  )$$,
  'Permission denied',
  'cross-school administrator cannot mutate this detention roster'
);

reset role;
select * from finish();
rollback;
