begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fce00000-0000-4000-8000-000000000001','session-scope-admin@example.test','authenticated','authenticated',now(),now()),
  ('fce00000-0000-4000-8000-000000000002','session-scope-supervisor@example.test','authenticated','authenticated',now(),now()),
  ('fce00000-0000-4000-8000-000000000003','session-scope-peer@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fce00000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fce10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fce00000-0000-4000-8000-000000000002','SESS-1','Session','Supervisor','active'),
  ('fce10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fce00000-0000-4000-8000-000000000003','SESS-2','Peer','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fce20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fce00000-0000-4000-8000-000000000001'),
  ('fce20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce10000-0000-4000-8000-000000000002','teacher','2026-01-01',null,'fce00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fce30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','First','SessionLearner'),
  ('fce30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Second','SessionLearner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fce40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce30000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
  ('fce40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce30000-0000-4000-8000-000000000002',2026,'2026-01-01','current');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values
  ('fce50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce30000-0000-4000-8000-000000000001',3,'2026-03-06','pending',2026,'2026-03-02','2026-03-06','fce10000-0000-4000-8000-000000000001'),
  ('fce50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce30000-0000-4000-8000-000000000002',3,'2026-03-13','pending',2026,'2026-03-09','2026-03-13','fce10000-0000-4000-8000-000000000001');

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,status,created_by_user_id
) values
  ('fce60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-03-06','14:00','15:00','fce10000-0000-4000-8000-000000000001','open','fce00000-0000-4000-8000-000000000001'),
  ('fce60000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-03-13','14:00','15:00','fce10000-0000-4000-8000-000000000001','open','fce00000-0000-4000-8000-000000000001');

insert into public.detention_session_items(
  id,tenant_id,school_id,detention_session_id,obligation_id,learner_id
) values
  ('fce70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce60000-0000-4000-8000-000000000001','fce50000-0000-4000-8000-000000000001','fce30000-0000-4000-8000-000000000001'),
  ('fce70000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce60000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000002','fce30000-0000-4000-8000-000000000002');

select ok(
  to_regprocedure('app_private.can_supervise_detention_session(uuid)') is not null,
  'date-aware detention-session supervisor predicate exists'
);
select ok(
  has_function_privilege('authenticated','app_private.can_supervise_detention_session(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.can_supervise_detention_session(uuid)','EXECUTE'),
  'narrow RLS predicate is authenticated-only'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fce00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.detention_sessions where id in ('fce60000-0000-4000-8000-000000000001','fce60000-0000-4000-8000-000000000002')),
  2,
  'assigned supervisor can initially read both sessions while placement covers both dates'
);
select is(
  (select count(*)::integer from public.detention_session_items where detention_session_id in ('fce60000-0000-4000-8000-000000000001','fce60000-0000-4000-8000-000000000002')),
  2,
  'assigned supervisor can initially read both session item rosters'
);
select is(
  public.record_detention_attendance('fce60000-0000-4000-8000-000000000001','fce50000-0000-4000-8000-000000000001','attended','Attended first session'),
  true,
  'date-valid assigned supervisor can record detention attendance'
);
select is(
  public.complete_detention_session('fce60000-0000-4000-8000-000000000001','First session complete'),
  true,
  'date-valid assigned supervisor can complete the detention session'
);

reset role;

select is(
  (select completed_by_user_id from public.detention_sessions where id='fce60000-0000-4000-8000-000000000001'),
  'fce00000-0000-4000-8000-000000000002'::uuid,
  'session completion preserves assigned supervisor actor provenance'
);
select is(
  (select completed_by_user_id from public.late_detention_obligations where id='fce50000-0000-4000-8000-000000000001'),
  'fce00000-0000-4000-8000-000000000002'::uuid,
  'attendance completion preserves assigned supervisor obligation provenance'
);

update public.staff_school_assignments
set effective_to='2026-03-09'
where id='fce20000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fce00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.detention_sessions where id='fce60000-0000-4000-8000-000000000002'),
  0,
  'supervisor loses direct session visibility when school placement no longer covers session date'
);
select is(
  (select count(*)::integer from public.detention_session_items where detention_session_id='fce60000-0000-4000-8000-000000000002'),
  0,
  'supervisor loses session-item visibility when placement no longer covers session date'
);
select throws_ok(
  $$select public.record_detention_attendance('fce60000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000002','attended','Should be denied')$$,
  'Permission denied',
  'expired-placement supervisor cannot record detention attendance'
);
select throws_ok(
  $$select public.complete_detention_session('fce60000-0000-4000-8000-000000000002','Should be denied')$$,
  'Permission denied',
  'expired-placement supervisor cannot complete detention session'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fce00000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.detention_sessions where id in ('fce60000-0000-4000-8000-000000000001','fce60000-0000-4000-8000-000000000002')),
  0,
  'unassigned peer staff cannot read another supervisor detention sessions'
);

reset role;
select * from finish();
rollback;
