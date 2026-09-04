begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('ac700000-0000-4000-8000-000000000001','client-operation-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('ac800000-0000-4000-8000-000000000001','Client Operation Scope Tenant B','client-operation-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ac810000-0000-4000-8000-000000000001','ac800000-0000-4000-8000-000000000001','Client Operation Scope School B','COS-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ac700000-0000-4000-8000-000000000001',
  'teacher',
  current_date
);

select throws_ok(
  $$insert into public.client_operation_receipts(
      tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'ac800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ac700000-0000-4000-8000-000000000001',
      'attendance.submit','ac820000-0000-4000-8000-000000000001','0123456789abcdef0123456789abcdef'
    )$$,
  'Client operation receipt scope mismatch: school does not belong to tenant',
  'client operation receipt tenant must match school tenant'
);

select lives_ok(
  $$insert into public.client_operation_receipts(
      id,tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'ac830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac700000-0000-4000-8000-000000000001',
      'attendance.submit','ac820000-0000-4000-8000-000000000001','0123456789abcdef0123456789abcdef'
    )$$,
  'valid client operation receipt remains allowed'
);

select lives_ok(
  $$update public.client_operation_receipts
       set result_payload='{"ok":true}'::jsonb, completed_at=now()
     where id='ac830000-0000-4000-8000-000000000001'$$,
  'receipt result and completion fields remain mutable'
);

select throws_ok(
  $$update public.client_operation_receipts set payload_fingerprint='fedcba9876543210fedcba9876543210' where id='ac830000-0000-4000-8000-000000000001'$$,
  'Client operation receipt scope and idempotency identity are immutable',
  'receipt payload fingerprint cannot be rewritten'
);

select throws_ok(
  $$update public.client_operation_receipts set client_operation_id=gen_random_uuid() where id='ac830000-0000-4000-8000-000000000001'$$,
  'Client operation receipt scope and idempotency identity are immutable',
  'receipt client operation identity cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_client_operation_receipt_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_client_operation_receipt_scope_integrity()','EXECUTE'),
  'client operation receipt integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.client_operation_receipts'::regclass and tgname='client_operation_receipt_scope_integrity_trg' and not tgisinternal),
  1,
  'client operation receipts have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
