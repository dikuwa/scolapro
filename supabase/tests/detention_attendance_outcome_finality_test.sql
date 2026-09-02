begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','attendance-finality-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','attendance-finality-supervisor@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fd010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fd000000-0000-4000-8000-000000000002','ATTF-1','Attendance','Supervisor','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'fd020000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fd010000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fd000000-0000-4000-8000-000000000001'
);

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fd030000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Attended','Learner'),
  ('fd030000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Absent','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fd040000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd030000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
  ('fd040000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd030000-0000-4000-8000-000000000002',2026,'2026-01-01','current');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values
  ('fd050000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd030000-0000-4000-8000-000000000001',3,'2026-05-08','pending',2026,'2026-05-04','2026-05-08','fd010000-0000-4000-8000-000000000001'),
  ('fd050000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd030000-0000-4000-8000-000000000002',3,'2026-05-08','pending',2026,'2026-05-04','2026-05-08','fd010000-0000-4000-8000-000000000001');

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,status,created_by_user_id
) values(
  'fd060000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '2026-05-08','14:00','15:00','fd010000-0000-4000-8000-000000000001','open','fd000000-0000-4000-8000-000000000001'
);

insert into public.detention_session_items(
  id,tenant_id,school_id,detention_session_id,obligation_id,learner_id
) values
  ('fd070000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000001','fd030000-0000-4000-8000-000000000001'),
  ('fd070000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000002','fd030000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.record_detention_attendance('fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000001','attended','Present for detention'),
  true,
  'assigned supervisor records attended outcome'
);
select is(
  public.record_detention_attendance('fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000002','absent','Did not attend'),
  true,
  'assigned supervisor records absent outcome'
);
select throws_ok(
  $$select public.record_detention_attendance('fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000001','absent','Attempted correction')$$,
  'Detention attendance outcome is already recorded',
  'recorded attended outcome cannot be overwritten'
);
select throws_ok(
  $$select public.record_detention_attendance('fd060000-0000-4000-8000-000000000001','fd050000-0000-4000-8000-000000000002','attended','Attempted correction')$$,
  'Detention attendance outcome is already recorded',
  'recorded absent outcome cannot be overwritten'
);

reset role;

select is(
  (select attendance_status from public.detention_session_items where id='fd070000-0000-4000-8000-000000000001'),
  'attended',
  'attended item remains final'
);
select is(
  (select status from public.late_detention_obligations where id='fd050000-0000-4000-8000-000000000001'),
  'completed',
  'attended outcome completes unresolved obligation'
);
select is(
  (select completed_by_user_id from public.late_detention_obligations where id='fd050000-0000-4000-8000-000000000001'),
  'fd000000-0000-4000-8000-000000000002'::uuid,
  'obligation completion preserves supervisor actor'
);
select is(
  (select status from public.late_detention_obligations where id='fd050000-0000-4000-8000-000000000002'),
  'pending',
  'absent outcome does not complete obligation'
);
select is(
  (select count(*)::integer from public.audit_events where event_type='detention.session.attendance_recorded' and entity_id in ('fd070000-0000-4000-8000-000000000001','fd070000-0000-4000-8000-000000000002')),
  2,
  'each final attendance outcome emits one durable audit event'
);
select is(
  (select count(*)::integer from public.audit_events where event_type='late_detention.resolved' and metadata->>'obligation_id'='fd050000-0000-4000-8000-000000000001'),
  1,
  'attended completion emits one canonical late-detention resolution audit'
);
select is(
  (select metadata->>'resolution_source' from public.audit_events where event_type='late_detention.resolved' and metadata->>'obligation_id'='fd050000-0000-4000-8000-000000000001' limit 1),
  'detention_session_attendance',
  'resolution audit identifies detention-session attendance source'
);
select is(
  (select metadata->>'completed_obligation' from public.audit_events where event_type='detention.session.attendance_recorded' and entity_id='fd070000-0000-4000-8000-000000000002' limit 1),
  'false',
  'absent attendance audit records that no obligation completion occurred'
);

select * from finish();
rollback;
