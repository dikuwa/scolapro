begin;

select plan(8);

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
  not ilike '%password%value%'
  and
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_password_rotation_clearance')
  not ilike '%credential_password%',
  'completion audit contains no password material'
);

select * from finish();
rollback;
