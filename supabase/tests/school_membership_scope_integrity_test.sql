begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ff000000-0000-4000-8000-000000000001','membership-scope-1@example.test','authenticated','authenticated',now(),now()),
  ('ff000000-0000-4000-8000-000000000002','membership-scope-2@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values
  ('ff100000-0000-4000-8000-000000000001','Membership Scope Tenant A','membership-scope-tenant-a'),
  ('ff100000-0000-4000-8000-000000000002','Membership Scope Tenant B','membership-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('ff110000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','Membership Scope School A','MEM-SCOPE-A','Khomas','Windhoek'),
  ('ff110000-0000-4000-8000-000000000002','ff100000-0000-4000-8000-000000000002','Membership Scope School B','MEM-SCOPE-B','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('ff120000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','MEM-T1','Teacher','One','active'),
  ('ff120000-0000-4000-8000-000000000002','ff100000-0000-4000-8000-000000000002','MEM-T2','Teacher','Two','active');

select throws_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
    values('ff100000-0000-4000-8000-000000000002','ff110000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','teacher',current_date)$$,
  'School membership scope mismatch: school does not belong to tenant',
  'membership tenant must match school tenant'
);

select throws_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('ff100000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','ff120000-0000-4000-8000-000000000002','teacher',current_date)$$,
  'School membership scope mismatch: staff member does not belong to tenant',
  'membership cannot attach staff from another tenant'
);

select lives_ok(
  $$insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
    values('ff130000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','teacher',current_date)$$,
  'valid membership without staff link remains allowed'
);

select lives_ok(
  $$update public.school_memberships set staff_member_id='ff120000-0000-4000-8000-000000000001'
    where id='ff130000-0000-4000-8000-000000000001'$$,
  'same-tenant staff identity may be attached after membership creation'
);

select throws_ok(
  $$update public.school_memberships set tenant_id='ff100000-0000-4000-8000-000000000002', school_id='ff110000-0000-4000-8000-000000000002'
    where id='ff130000-0000-4000-8000-000000000001'$$,
  'School membership tenant, school, and user identity are immutable',
  'membership cannot be moved to another school'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_membership_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_membership_scope_integrity()','EXECUTE'),
  'membership integrity trigger helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.school_memberships'::regclass and tgname='school_membership_scope_integrity_trg' and not tgisinternal),
  1,
  'school memberships have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
