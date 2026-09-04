begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f9800000-0000-4000-8000-000000000001','membership-account-one@example.test','authenticated','authenticated',now(),now()),
  ('f9800000-0000-4000-8000-000000000002','membership-account-two@example.test','authenticated','authenticated',now(),now()),
  ('f9800000-0000-4000-8000-000000000003','membership-account-three@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('f9810000-0000-4000-8000-000000000001','Membership Account Tenant','membership-account-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('f9820000-0000-4000-8000-000000000001','f9810000-0000-4000-8000-000000000001','Membership Account School A','MEM-ACCOUNT-A','Khomas','Windhoek'),
  ('f9820000-0000-4000-8000-000000000002','f9810000-0000-4000-8000-000000000001','Membership Account School B','MEM-ACCOUNT-B','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('f9830000-0000-4000-8000-000000000001','f9810000-0000-4000-8000-000000000001','f9800000-0000-4000-8000-000000000001','MEM-A1','Linked','Staff','active'),
  ('f9830000-0000-4000-8000-000000000002','f9810000-0000-4000-8000-000000000001',null,'MEM-A2','Unlinked','Staff','active');

select throws_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000001','f9800000-0000-4000-8000-000000000002','f9830000-0000-4000-8000-000000000001','teacher',current_date)$$,
  'School membership scope mismatch: staff member is linked to another user account',
  'membership cannot attach a staff identity already linked to another account'
);

select lives_ok(
  $$insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9840000-0000-4000-8000-000000000001','f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000001','f9800000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001','teacher',current_date)$$,
  'matching linked staff identity remains valid'
);

select lives_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000002','f9800000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001','class_teacher',current_date)$$,
  'same staff identity may represent the same user across schools and roles'
);

select lives_ok(
  $$insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9840000-0000-4000-8000-000000000002','f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000001','f9800000-0000-4000-8000-000000000002','f9830000-0000-4000-8000-000000000002','librarian',current_date)$$,
  'an unlinked same-tenant staff identity may be associated to its first membership account'
);

select throws_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000002','f9800000-0000-4000-8000-000000000003','f9830000-0000-4000-8000-000000000002','teacher',current_date)$$,
  'School membership scope mismatch: staff identity is already attached to another user account',
  'unlinked staff identity cannot be aliased to a second account through another membership'
);

select throws_ok(
  $$update public.staff_members
       set user_id='f9800000-0000-4000-8000-000000000003'
     where id='f9830000-0000-4000-8000-000000000002'$$,
  'Staff member account does not match linked school membership account',
  'later staff-account linking cannot contradict the membership account'
);

select lives_ok(
  $$update public.staff_members
       set user_id='f9800000-0000-4000-8000-000000000002'
     where id='f9830000-0000-4000-8000-000000000002'$$,
  'later staff-account linking to the same membership account remains valid'
);

select throws_ok(
  $$insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
    values('f9810000-0000-4000-8000-000000000001','f9820000-0000-4000-8000-000000000001','f9800000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001','teacher',current_date)$$,
  'duplicate key value violates unique constraint "school_memberships_school_id_user_id_role_key_active_from_key"',
  'existing membership uniqueness still prevents duplicate account-role periods independently of staff identity'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_membership_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_membership_scope_integrity()','EXECUTE'),
  'school membership identity helper remains private from client roles'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_staff_member_membership_identity_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_staff_member_membership_identity_integrity()','EXECUTE'),
  'reverse staff membership identity helper is private from client roles'
);

select * from finish();
rollback;
