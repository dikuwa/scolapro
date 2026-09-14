begin;
select plan(21);

-- Stable fixture IDs.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('a9100000-0000-4000-8000-000000000001','det-wave-admin@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000002','det-wave-support@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000003','det-wave-multi@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000004','det-wave-supervisor@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000005','det-wave-other@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
  ('a9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Detention Wave Other School','DET-W2-OTHER','Erongo','Walvis Bay');

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('a9100000-0000-4000-8000-000000000002','platform_support',current_date-10);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000002','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','a9110000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000003','school_admin',current_date-20),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000003','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000004','teacher',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000005','teacher',current_date-1);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('a9120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','a9100000-0000-4000-8000-000000000004','DET-W2-SUP','Wave','Supervisor','active'),
  ('a9120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','a9100000-0000-4000-8000-000000000005','DET-W2-OTHER','Other','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('a9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9120000-0000-4000-8000-000000000001','teacher',current_date-30,null,'a9100000-0000-4000-8000-000000000001'),
  ('a9130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9120000-0000-4000-8000-000000000002','teacher',current_date-30,null,'a9100000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('a9140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Wave','Learner'),
  ('a9140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status
) values
  ('a9150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9140000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-30,null,'current'),
  ('a9150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9140000-0000-4000-8000-000000000002',extract(year from current_date)::integer,current_date-30,current_date-1,'withdrawn');

-- Force this test to exercise the repository default threshold semantics.
delete from public.school_late_arrival_policies
where school_id='22222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000001',true);

select ok(
  app_private.can_manage_current_detention_school('22222222-2222-4222-8222-222222222222'),
  'current-school leadership has detention management authority'
);

select throws_ok(
  $$ select public.bulk_record_school_late_arrivals(array['a9150000-0000-4000-8000-000000000002'::uuid],current_date,null,null) $$,
  'Active learner enrolment not found for arrival date',
  'ended/non-current learner enrolment cannot receive a current bulk late arrival'
);

-- Six cumulative late arrivals should create exactly two independent obligations at the
-- existing default threshold of three.
select lives_ok($$ select public.record_school_late_arrival('a9150000-0000-4000-8000-000000000001',current_date-6,null,null) $$,'late 1 recorded');
select lives_ok($$ select public.record_school_late_arrival('a9150000-0000-4000-8000-000000000001',current_date-5,null,null) $$,'late 2 recorded');
select lives_ok($$ select public.record_school_late_arrival('a9150000-0000-4000-8000-000000000001',current_date-4,null,null) $$,'late 3 recorded');

select is(
  (select cumulative_threshold from public.school_late_arrival_policies where school_id='22222222-2222-4222-8222-222222222222'),
  3::smallint,
  'default cumulative threshold remains three'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001'),
  1,
  'first threshold block creates one detention obligation'
);

select lives_ok($$ select public.bulk_record_school_late_arrivals(
  array['a9150000-0000-4000-8000-000000000001'::uuid],current_date-3,null,'bulk 4') $$,'bulk late capture reuses canonical recording');
select lives_ok($$ select public.record_school_late_arrival('a9150000-0000-4000-8000-000000000001',current_date-2,null,null) $$,'late 5 recorded');
select lives_ok($$ select public.record_school_late_arrival('a9150000-0000-4000-8000-000000000001',current_date-1,null,null) $$,'late 6 recorded');

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001'),
  2,
  'second threshold block creates a separate outstanding obligation'
);

-- Create a future duty with zero learners; later attach both existing obligations to the
-- same session rather than manufacturing another session.
select lives_ok($$
  select public.create_detention_session_plan(
    '22222222-2222-4222-8222-222222222222',current_date+14,'14:00','15:30','Room D','Wave 2 test',
    array['a9120000-0000-4000-8000-000000000001'::uuid]
  )
$$,'zero-learner future detention duty can be planned');

select is(
  (select count(*)::integer from public.detention_session_items dsi
   join public.detention_sessions ds on ds.id=dsi.detention_session_id
   where ds.school_id='22222222-2222-4222-8222-222222222222' and ds.session_date=current_date+14),
  0,
  'planned duty initially contains zero learners'
);

select lives_ok($$
  select public.assign_detention_session_learners(
    (select id from public.detention_sessions where school_id='22222222-2222-4222-8222-222222222222' and session_date=current_date+14 order by created_at desc limit 1),
    array(select id from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001' order by created_at),
    'a9120000-0000-4000-8000-000000000001'
  )
$$,'existing zero-learner duty accepts later learner allocation');

select is(
  (select count(*)::integer from public.detention_sessions where school_id='22222222-2222-4222-8222-222222222222' and session_date=current_date+14),
  1,
  'later learner allocation does not create a duplicate detention session'
);

-- Notification targeting is covered by detention_notification_route_alignment_test.sql,
-- which asserts recipient_user_id routing rather than tenant-wide fan-out.

-- One attended item resolves only its own durable obligation.
select lives_ok(format(
  'select public.record_detention_attendance(%L::uuid,%L::uuid,%L,%L)',
  (select id from public.detention_sessions where school_id='22222222-2222-4222-8222-222222222222' and session_date=current_date+14 order by created_at desc limit 1),
  (select id from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001' order by created_at limit 1),
  'attended','served'
),'canonical attendance records one attended learner');

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001' and status='completed'),
  1,
  'one completed detention clears exactly one obligation'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001' and status in ('pending','carried_forward')),
  1,
  'unrelated detention obligation remains outstanding'
);

-- Make the already-planned supervisor stale for the future session and verify the live
-- supervisor boundary no longer permits mutation.
reset role;
update public.staff_school_assignments
set effective_to=current_date
where id='a9130000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000004',true);

select throws_ok(format(
  'select public.record_detention_attendance(%L::uuid,%L::uuid,%L,%L)',
  (select id from public.detention_sessions where school_id='22222222-2222-4222-8222-222222222222' and session_date=current_date+14 order by created_at desc limit 1),
  (select id from public.late_detention_obligations where learner_id='a9140000-0000-4000-8000-000000000001' and status in ('pending','carried_forward') limit 1),
  'absent','stale supervisor should fail'
), 'Permission denied', 'stale supervisor placement cannot retain detention mutation authority');

-- Mixed Platform Support + school leadership must remain non-operational.
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.create_detention_session_plan(
    '22222222-2222-4222-8222-222222222222',current_date+21,'14:00','15:00',null,null,
    array['a9120000-0000-4000-8000-000000000002'::uuid]
  ) $$,
  'Permission denied',
  'Platform Support cannot perform school-operational detention planning'
);

-- A user with two active school memberships may operate only the deterministic current school.
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.create_detention_session_plan(
    'a9110000-0000-4000-8000-000000000001',current_date+21,'14:00','15:00',null,null,
    array['a9120000-0000-4000-8000-000000000002'::uuid]
  ) $$,
  'Permission denied',
  'another active non-current school cannot authorize detention operations'
);

select * from finish();
rollback;
