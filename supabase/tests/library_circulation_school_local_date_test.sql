begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd740000-0000-4000-8000-000000000001','library-local@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000002','library-platform@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000003','library-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd740000-0000-4000-8000-000000000001',
  'librarian',
  current_date
);

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fd740000-0000-4000-8000-000000000002',
  'platform_admin',
  current_date
);

select ok(
  app_private.user_can_manage_ltsm(
    'fd740000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222'
  ),
  'school-local librarian is authorized to manage circulation'
);

select ok(
  not app_private.user_can_manage_ltsm(
    'fd740000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222'
  ),
  'platform authority alone cannot manage school circulation'
);

select ok(
  not app_private.user_can_manage_ltsm(
    'fd740000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222'
  ),
  'user without a school-local circulation role is rejected'
);

select unlike(
  pg_get_functiondef('app_private.can_manage_ltsm(uuid)'::regprocedure),
  '%platform_admin%',
  'current-user circulation authorization has no platform-admin bypass'
);

select is(
  app_private.learning_resource_today(),
  (now() at time zone 'Africa/Windhoek')::date,
  'circulation lifecycle resolves today in Namibia local time'
);

select like(
  pg_get_functiondef('public.issue_learning_resource(uuid,uuid,uuid,date,text)'::regprocedure),
  '%learning_resource_today()%','issue RPC uses Namibia-local lifecycle date'
);

select unlike(
  pg_get_functiondef('public.issue_learning_resource(uuid,uuid,uuid,date,text)'::regprocedure),
  '%current_date%',
  'issue RPC no longer depends on database UTC current_date'
);

select ok(
  pg_get_functiondef('public.return_learning_resource(uuid,text,text)'::regprocedure) like '%learning_resource_today()%'
  and pg_get_functiondef('public.return_learning_resource(uuid,text,text)'::regprocedure) not like '%current_date%',
  'return RPC uses the same Namibia-local lifecycle date'
);

select * from finish();
rollback;
