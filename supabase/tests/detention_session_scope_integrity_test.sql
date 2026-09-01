begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd700000-0000-4000-8000-000000000001','detention-session-scope@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values
  ('fd710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Scope','Supervisor A','active'),
  ('fd710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Scope','Supervisor A2','active');

insert into public.tenants(id,name,slug)
values('fd800000-0000-4000-8000-000000000001','Detention Session Scope Tenant B','detention-session-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fd810000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001','Detention Session Scope School B','DSS-B','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fd820000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001','Scope','Supervisor B','active');

select throws_ok(
  $$insert into public.detention_sessions(tenant_id,school_id,session_date,created_by_user_id)
    values('fd800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','2026-02-06','fd700000-0000-4000-8000-000000000001')$$,
  'Detention session scope mismatch: school does not belong to tenant',
  'detention session tenant must match school tenant'
);

select throws_ok(
  $$insert into public.detention_sessions(tenant_id,school_id,session_date,supervisor_staff_member_id,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-02-06','fd820000-0000-4000-8000-000000000001','fd700000-0000-4000-8000-000000000001')$$,
  'Detention session scope mismatch: supervisor does not belong to tenant',
  'detention supervisor must match session tenant'
);

select lives_ok(
  $$insert into public.detention_sessions(id,tenant_id,school_id,session_date,supervisor_staff_member_id,created_by_user_id)
    values('fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-02-06','fd710000-0000-4000-8000-000000000001','fd700000-0000-4000-8000-000000000001')$$,
  'valid detention session remains allowed'
);

select lives_ok(
  $$update public.detention_sessions set supervisor_staff_member_id='fd710000-0000-4000-8000-000000000002' where id='fd830000-0000-4000-8000-000000000001'$$,
  'same-tenant supervisor replacement remains allowed'
);

select lives_ok(
  $$update public.detention_sessions set session_date='2026-02-13', status='completed', completed_at=now(), completed_by_user_id='fd700000-0000-4000-8000-000000000001' where id='fd830000-0000-4000-8000-000000000001'$$,
  'normal detention session lifecycle and rescheduling fields remain mutable'
);

select throws_ok(
  $$update public.detention_sessions set tenant_id='fd800000-0000-4000-8000-000000000001', school_id='fd810000-0000-4000-8000-000000000001' where id='fd830000-0000-4000-8000-000000000001'$$,
  'Detention session tenant and school are immutable',
  'detention session tenant and school cannot move after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_detention_session_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_detention_session_scope_integrity()','EXECUTE'),
  'detention session integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.detention_sessions'::regclass and tgname='detention_session_scope_integrity_trg' and not tgisinternal),
  1,
  'detention sessions have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
