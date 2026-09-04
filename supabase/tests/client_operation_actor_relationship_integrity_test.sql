begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fab00000-0000-4000-8000-000000000001','client-actor-member@example.test','authenticated','authenticated',now(),now()),
  ('fab00000-0000-4000-8000-000000000002','client-actor-expired@example.test','authenticated','authenticated',now(),now()),
  ('fab00000-0000-4000-8000-000000000003','client-actor-platform@example.test','authenticated','authenticated',now(),now()),
  ('fab00000-0000-4000-8000-000000000004','client-actor-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fab10000-0000-4000-8000-000000000001','Client Actor Tenant','client-actor-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fab20000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001','Client Actor School','CLIENT-ACTOR','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to)
values
  ('fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000001','teacher',current_date-10,null),
  ('fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000002','teacher',current_date-20,current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fab00000-0000-4000-8000-000000000003','platform_admin',current_date-1);

select throws_ok(
  $$insert into public.client_operation_receipts(
      tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000004',
      'test.operation','fab30000-0000-4000-8000-000000000001','0123456789abcdef0123456789abcdef'
    )$$,
  'Client operation receipt scope mismatch: actor is not related to school',
  'unrelated account cannot own a school client operation receipt'
);

select throws_ok(
  $$insert into public.client_operation_receipts(
      tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000002',
      'test.operation','fab30000-0000-4000-8000-000000000002','0123456789abcdef0123456789abcdef'
    )$$,
  'Client operation receipt scope mismatch: actor is not related to school',
  'expired school relationship cannot originate a new client operation receipt'
);

select lives_ok(
  $$insert into public.client_operation_receipts(
      tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000001',
      'test.operation','fab30000-0000-4000-8000-000000000003','0123456789abcdef0123456789abcdef'
    )$$,
  'active school member remains a valid client operation actor'
);

select lives_ok(
  $$insert into public.client_operation_receipts(
      tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
    ) values(
      'fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000003',
      'test.operation','fab30000-0000-4000-8000-000000000004','0123456789abcdef0123456789abcdef'
    )$$,
  'active platform administrator remains a valid client operation actor'
);

select is(
  (select count(*)::integer from public.client_operation_receipts where actor_user_id='fab00000-0000-4000-8000-000000000004'),
  0,
  'rejected unrelated actor leaves no idempotency receipt'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_client_operation_receipt_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_client_operation_receipt_scope_integrity()','EXECUTE'),
  'client operation actor integrity helper remains private from client roles'
);

select * from finish();
rollback;
