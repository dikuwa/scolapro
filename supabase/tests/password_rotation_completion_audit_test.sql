begin;

select plan(14);

select has_function(
  'public',
  'complete_password_rotation_clearance',
  array['uuid'],
  'audited password rotation completion RPC exists'
);

select ok(
  not has_function_privilege('authenticated','public.complete_password_rotation_clearance(uuid)','EXECUTE'),
  'authenticated clients cannot clear rotation through the completion RPC'
);

select ok(
  not has_function_privilege('anon','public.complete_password_rotation_clearance(uuid)','EXECUTE'),
  'anonymous clients cannot clear rotation through the completion RPC'
);

select ok(
  has_function_privilege('service_role','public.complete_password_rotation_clearance(uuid)','EXECUTE'),
  'service role may complete password rotation after Auth update'
);

select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance'),
  'rotation completion RPC is security definer'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  ilike '%password_rotation_expires_at=null%',
  'completion clears managed temporary credential expiry'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  ilike '%auth.password_rotation_completed%',
  'completion records a security audit event'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  not ilike '%p_password%'
  and
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  not ilike '%credential_password%'
  and
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  not ilike '%new_password%',
  'completion audit contains no password material'
);


insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'b3000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','rotation-audit@scolapro.invalid','',
  now(),now(),now()
);

insert into public.user_profiles (
  user_id, display_name, must_change_password, password_rotation_expires_at
) values (
  'b3000000-0000-4000-8000-000000000001',
  'Rotation Audit',
  true,
  now()+interval '1 hour'
);

select set_config('request.jwt.claim.role','service_role',true);

select is(
  public.complete_password_rotation_clearance('b3000000-0000-4000-8000-000000000001'),
  true,
  'service completion clears an actually gated account'
);

select is(
  (select must_change_password from public.user_profiles where user_id='b3000000-0000-4000-8000-000000000001'),
  false,
  'completion clears the mandatory rotation flag'
);

select is(
  (select password_rotation_expires_at from public.user_profiles where user_id='b3000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'completion clears managed credential expiry'
);

select is(
  (select count(*)::integer from public.audit_events
   where actor_user_id='b3000000-0000-4000-8000-000000000001'
     and event_type='auth.password_rotation_completed'),
  1,
  'completion writes exactly one non-secret audit event'
);

select is(
  public.complete_password_rotation_clearance('b3000000-0000-4000-8000-000000000001'),
  false,
  'completed rotation replay is idempotently rejected'
);

select is(
  (select count(*)::integer from public.audit_events
   where actor_user_id='b3000000-0000-4000-8000-000000000001'
     and event_type='auth.password_rotation_completed'),
  1,
  'replay does not duplicate the rotation audit event'
);

select * from finish();
rollback;
