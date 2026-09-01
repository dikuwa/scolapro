begin;

select plan(8);

insert into public.tenants(id,name,slug)
values('ad800000-0000-4000-8000-000000000001','Audit Event Scope Tenant B','audit-event-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ad810000-0000-4000-8000-000000000001','ad800000-0000-4000-8000-000000000001','Audit Event Scope School B','AES-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.audit_events(school_id,event_type,entity_type)
    values('22222222-2222-4222-8222-222222222222','test.audit','test')$$,
  'Audit event scope mismatch: school-scoped event requires tenant',
  'school-scoped audit event requires tenant provenance'
);

select throws_ok(
  $$insert into public.audit_events(tenant_id,school_id,event_type,entity_type)
    values('ad800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','test.audit','test')$$,
  'Audit event scope mismatch: school does not belong to tenant',
  'audit event tenant must match school tenant'
);

select lives_ok(
  $$insert into public.audit_events(id,tenant_id,school_id,event_type,entity_type,metadata)
    values('ad820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','test.audit','test','{"ok":true}'::jsonb)$$,
  'valid school-scoped audit event remains allowed'
);

select lives_ok(
  $$insert into public.audit_events(id,tenant_id,event_type,entity_type)
    values('ad820000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','tenant.audit','tenant')$$,
  'tenant-level audit event without school remains allowed'
);

select lives_ok(
  $$insert into public.audit_events(id,event_type,entity_type)
    values('ad820000-0000-4000-8000-000000000003','platform.audit','platform')$$,
  'platform-level audit event without tenant or school remains allowed'
);

select throws_ok(
  $$update public.audit_events set metadata='{"rewritten":true}'::jsonb where id='ad820000-0000-4000-8000-000000000001'$$,
  'Audit events are immutable',
  'audit event metadata cannot be rewritten after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_audit_event_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_audit_event_integrity()','EXECUTE'),
  'audit event integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.audit_events'::regclass and tgname='audit_event_integrity_trg' and not tgisinternal),
  1,
  'audit events have exactly one integrity trigger'
);

select * from finish();
rollback;
