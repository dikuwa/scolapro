begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('e5000000-0000-4000-8000-000000000001','staff-admin@example.test','authenticated','authenticated',now(),now()),
  ('e5000000-0000-4000-8000-000000000002','staff-linked@example.test','authenticated','authenticated',now(),now());
insert into public.tenants(id,name,slug,status)
values('e5100000-0000-4000-8000-000000000001','Staff Reconciliation Tenant','staff-reconciliation-tenant','active');
insert into public.schools(id,tenant_id,name,emis_number,status)
values('e5200000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000001','Staff Reconciliation School','STAFF-RECON','active');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('e5100000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','school_admin',current_date-5);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('e5300000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000001',null,'EMP-565','Canonical','Staff','active'),
  ('e5300000-0000-4000-8000-000000000002','e5100000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','EMP-565','Canonical','Staff','active');
insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id)
values
  ('e5100000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','e5300000-0000-4000-8000-000000000001','teacher','Teacher',current_date-10,'e5000000-0000-4000-8000-000000000001'),
  ('e5100000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','e5300000-0000-4000-8000-000000000002','teacher','Teacher duplicate',current_date-10,'e5000000-0000-4000-8000-000000000001');
insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('e5100000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','e5300000-0000-4000-8000-000000000002','teacher',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated","email":"staff-admin@example.test"}',true);
set local role authenticated;

select throws_ok(
  $$select public.reconcile_staff_identities(
    'e5200000-0000-4000-8000-000000000001',
    'e5300000-0000-4000-8000-000000000001',
    'e5300000-0000-4000-8000-000000000002',
    'CONFIRM',
    'wrong confirmation'
  )$$,
  'Type RECONCILE to confirm the identity merge',
  'reconciliation requires explicit confirmation'
);
select is(
  public.reconcile_staff_identities(
    'e5200000-0000-4000-8000-000000000001',
    'e5300000-0000-4000-8000-000000000001',
    'e5300000-0000-4000-8000-000000000002',
    'RECONCILE',
    'exact employee number and existing account link'
  ),
  'e5300000-0000-4000-8000-000000000001'::uuid,
  'canonical identity is returned'
);
select is(
  (select user_id from public.staff_members where id='e5300000-0000-4000-8000-000000000001'),
  'e5000000-0000-4000-8000-000000000002'::uuid,
  'linked Auth account moves to canonical identity'
);
select is(
  (select count(*)::integer from public.school_memberships where staff_member_id='e5300000-0000-4000-8000-000000000001' and role_key='teacher'),
  1,
  'effective school role is attached to canonical identity'
);
select is(
  (select reconciled_into_staff_member_id from public.staff_members where id='e5300000-0000-4000-8000-000000000002'),
  'e5300000-0000-4000-8000-000000000001'::uuid,
  'duplicate remains as a governed historical pointer'
);
select is(
  (select status from public.staff_members where id='e5300000-0000-4000-8000-000000000002'),
  'inactive',
  'duplicate is not deleted'
);
select ok(
  exists(
    select 1 from public.staff_school_assignments
    where staff_member_id='e5300000-0000-4000-8000-000000000001'
      and position_title='Teacher duplicate'
  ),
  'historical/current placement evidence remains explainable on canonical identity'
);
select is(
  (select user_id from public.staff_members where id='e5300000-0000-4000-8000-000000000002'),
  null::uuid,
  'duplicate no longer carries the Auth link'
);
select is(
  (select count(*)::integer from public.audit_events where event_type='staff.identity.reconciled' and entity_id='e5300000-0000-4000-8000-000000000001'),
  1,
  'reconciliation provenance is recorded once'
);
select is(
  (select count(*)::integer from public.audit_events where event_type='staff.identity.corrected'),
  0,
  'reconciliation does not fabricate a correction event'
);
select throws_ok(
  $$select public.correct_staff_details(
    'e5200000-0000-4000-8000-000000000001',
    'e5300000-0000-4000-8000-000000000001',
    'Canonical','Staff','EMP-565','Senior Teacher','staff_directory','typo'
  )$$,
  'Employee number already belongs to another active staff identity',
  'correction cannot silently claim a duplicate employee number'
);
select ok(
  exists(
    select 1 from public.school_memberships
    where user_id='e5000000-0000-4000-8000-000000000002'
      and staff_member_id='e5300000-0000-4000-8000-000000000001'
  ),
  'existing school membership remains linked to canonical identity'
);

select * from finish();
rollback;