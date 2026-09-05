begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe000000-0000-4000-8000-000000000001','staff-placement-manager@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000002','staff-placement-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','PLACEMENT-ACTOR-1','Placement','Recipient','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','school_admin',current_date);

select throws_ok(
  $$insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','staff',current_date,'fe000000-0000-4000-8000-000000000002')$$,
  'Staff assignment creator is not authorized for school',
  'trusted write cannot forge an unrelated staff-placement creator'
);

select lives_ok(
  $$insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
    values('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','staff',current_date,'fe000000-0000-4000-8000-000000000001')$$,
  'authorized school leader can create a canonical staff placement'
);

select throws_ok(
  $$update public.staff_school_assignments set created_by_user_id='fe000000-0000-4000-8000-000000000002' where id='fe200000-0000-4000-8000-000000000001'$$,
  'Staff assignment creator provenance is immutable',
  'staff-placement creator provenance cannot be rewritten'
);

select lives_ok(
  $$update public.staff_school_assignments set effective_to=current_date+30 where id='fe200000-0000-4000-8000-000000000001'$$,
  'ordinary placement lifecycle maintenance remains allowed'
);

select ok(
  (select created_by_user_id='fe000000-0000-4000-8000-000000000001'::uuid and effective_to=current_date+30
     from public.staff_school_assignments where id='fe200000-0000-4000-8000-000000000001'),
  'placement lifecycle preserves durable creator provenance'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_staff_school_assignment(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_staff_school_assignment(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_staff_school_assignment_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_staff_school_assignment_actor_integrity()','EXECUTE'),
  'staff-placement actor helpers remain private from client roles'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgrelid='public.staff_school_assignments'::regclass
     and tgname='staff_school_assignment_submit_actor_integrity_trg'
     and not tgisinternal),
  1,
  'staff-placement actor integrity trigger is installed once'
);

select * from finish();
rollback;