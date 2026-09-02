begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fcf00000-0000-4000-8000-000000000001','detention-finality-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcf00000-0000-4000-8000-000000000002','detention-finality-supervisor@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcf00000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fcf10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fcf00000-0000-4000-8000-000000000002','FINAL-1','Finality','Supervisor','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'fcf20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcf10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fcf00000-0000-4000-8000-000000000001'
);

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,status,created_by_user_id
) values
  ('fcf60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-04-10','14:00','15:00','fcf10000-0000-4000-8000-000000000001','open','fcf00000-0000-4000-8000-000000000001'),
  ('fcf60000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-04-17','14:00','15:00','fcf10000-0000-4000-8000-000000000001','cancelled','fcf00000-0000-4000-8000-000000000001');

select ok(
  to_regprocedure('public.complete_detention_session(uuid,text)') is not null,
  'detention session completion RPC exists'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.complete_detention_session('fcf60000-0000-4000-8000-000000000001','Supervisor completed once'),
  true,
  'date-valid assigned supervisor can complete open session once'
);

select throws_ok(
  $$select public.complete_detention_session('fcf60000-0000-4000-8000-000000000001','Duplicate completion')$$,
  'Detention session is already completed',
  'completed session cannot be completed twice'
);

select throws_ok(
  $$select public.complete_detention_session('fcf60000-0000-4000-8000-000000000002','Cancelled completion')$$,
  'Cancelled detention sessions cannot be completed',
  'cancelled session cannot be completed'
);

reset role;

select is(
  (select status from public.detention_sessions where id='fcf60000-0000-4000-8000-000000000001'),
  'completed',
  'successful completion persists completed status'
);
select is(
  (select completed_by_user_id from public.detention_sessions where id='fcf60000-0000-4000-8000-000000000001'),
  'fcf00000-0000-4000-8000-000000000002'::uuid,
  'successful completion preserves supervisor actor'
);
select is(
  (select status from public.detention_sessions where id='fcf60000-0000-4000-8000-000000000002'),
  'cancelled',
  'cancelled session remains cancelled after denied completion'
);
select is(
  (select count(*)::integer from public.audit_events where event_type='detention.session.completed' and entity_id='fcf60000-0000-4000-8000-000000000001'),
  1,
  'exactly one completion audit event is emitted'
);
select is(
  (select metadata->>'previous_status' from public.audit_events where event_type='detention.session.completed' and entity_id='fcf60000-0000-4000-8000-000000000001' limit 1),
  'open',
  'completion audit preserves previous lifecycle status'
);

select * from finish();
rollback;
