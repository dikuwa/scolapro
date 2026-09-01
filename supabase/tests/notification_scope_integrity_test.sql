begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f1800000-0000-4000-8000-000000000001','notification-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('f1810000-0000-4000-8000-000000000001','Notification Scope Tenant B','notification-scope-tenant-b');

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title)
    values('f1800000-0000-4000-8000-000000000001',null,'22222222-2222-4222-8222-222222222222','info','Bad school scope')$$,
  'Notification scope mismatch: school-scoped notification requires tenant',
  'school-scoped notification requires tenant'
);

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title)
    values('f1800000-0000-4000-8000-000000000001','f1810000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','info','Bad tenant scope')$$,
  'Notification scope mismatch: school does not belong to tenant',
  'school-scoped notification tenant must match school tenant'
);

select lives_ok(
  $$insert into public.notifications(id,recipient_user_id,tenant_id,school_id,severity,title,body,href)
    values('f1820000-0000-4000-8000-000000000001','f1800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','success','Valid notification','Valid body','/notifications')$$,
  'valid school-scoped notification remains allowed'
);

select lives_ok(
  $$update public.notifications set read_at=now(), dismissed_at=now() where id='f1820000-0000-4000-8000-000000000001'$$,
  'notification read and dismissal lifecycle remains mutable'
);

select throws_ok(
  $$update public.notifications set title='Rewritten notification' where id='f1820000-0000-4000-8000-000000000001'$$,
  'Notification recipient, scope, content, and creation provenance are immutable',
  'notification content cannot be rewritten after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_notification_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_notification_scope_integrity()','EXECUTE'),
  'notification integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.notifications'::regclass and tgname='notification_scope_integrity_trg' and not tgisinternal),
  1,
  'notifications have exactly one scope-integrity trigger'
);

select * from finish();
rollback;