begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe400000-0000-4000-8000-000000000001','detention-actor-manager@example.test','authenticated','authenticated',now(),now()),
('fe400000-0000-4000-8000-000000000002','detention-actor-outsider@example.test','authenticated','authenticated',now(),now()),
('fe400000-0000-4000-8000-000000000003','detention-actor-supervisor@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe400000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fe410000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe400000-0000-4000-8000-000000000003','DET-ACTOR-SUP','Detention','Supervisor','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('fe420000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe410000-0000-4000-8000-000000000001','staff',current_date,'fe400000-0000-4000-8000-000000000001');

select is(
  app_private.user_can_coordinate_detention_session('fe400000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',current_date),
  false,
  'unrelated account fails date-aware coordination authority used by deferred creator validation'
);

select lives_ok(
  $$insert into public.detention_sessions(id,tenant_id,school_id,session_date,status,supervisor_staff_member_id,created_by_user_id)
    values('fe430000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',current_date,'planned','fe410000-0000-4000-8000-000000000001','fe400000-0000-4000-8000-000000000001')$$,
  'authorized coordinator can create a canonical detention session'
);

select throws_ok(
  $$insert into public.detention_session_supervisors(tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe430000-0000-4000-8000-000000000001','fe410000-0000-4000-8000-000000000001','fe400000-0000-4000-8000-000000000002')$$,
  'Detention supervisor assigner is not authorized for session',
  'trusted duty-team write cannot forge an unrelated assigner'
);

select lives_ok(
  $$insert into public.detention_session_supervisors(id,tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id)
    values('fe440000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe430000-0000-4000-8000-000000000001','fe410000-0000-4000-8000-000000000001','fe400000-0000-4000-8000-000000000001')$$,
  'authorized coordinator can assign a detention duty-team member'
);

select throws_ok(
  $$update public.detention_sessions set status='completed',completed_by_user_id='fe400000-0000-4000-8000-000000000002',completed_at=now() where id='fe430000-0000-4000-8000-000000000001'$$,
  'Detention session completer is not authorized for session',
  'trusted completion write cannot forge an unrelated completer'
);

select lives_ok(
  $$update public.detention_sessions set status='completed',completed_by_user_id='fe400000-0000-4000-8000-000000000003',completed_at=now() where id='fe430000-0000-4000-8000-000000000001'$$,
  'date-valid assigned supervisor can complete the detention session'
);

select throws_ok(
  $$update public.detention_sessions set completed_by_user_id='fe400000-0000-4000-8000-000000000001' where id='fe430000-0000-4000-8000-000000000001'$$,
  'Detention session completion provenance is immutable',
  'terminal detention-session completion actor cannot be rewritten'
);

select throws_ok(
  $$update public.detention_session_supervisors set assigned_by_user_id='fe400000-0000-4000-8000-000000000002' where id='fe440000-0000-4000-8000-000000000001'$$,
  'Detention supervisor assigner provenance is immutable',
  'detention duty-team assigner cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_coordinate_detention_session(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_complete_detention_session_actor(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_detention_session_creator_commit_integrity()','EXECUTE')
  and exists(
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.detention_sessions'::regclass
      and tgname='detention_session_creator_commit_integrity_trg'
      and tgdeferrable and tginitdeferred and not tgisinternal
  ),
  'detention actor helpers remain private and creator authority is commit-enforced'
);

select * from finish();
rollback;