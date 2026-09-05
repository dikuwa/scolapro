begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd800000-0000-4000-8000-000000000001','school-duty-actor-manager@example.test','authenticated','authenticated',now(),now()),
  ('fd800000-0000-4000-8000-000000000002','school-duty-actor-outsider@example.test','authenticated','authenticated',now(),now()),
  ('fd800000-0000-4000-8000-000000000003','school-duty-actor-staff@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fd810000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fd800000-0000-4000-8000-000000000003',
  'DUTY-ACTOR-1','Duty','Recipient','active'
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd800000-0000-4000-8000-000000000001',null,'school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd800000-0000-4000-8000-000000000003','fd810000-0000-4000-8000-000000000001','teacher',current_date);

select throws_ok(
  $$insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','late_arrival_recorder',current_date,'fd800000-0000-4000-8000-000000000002')$$,
  'School duty assigner is not authorized for school',
  'trusted write cannot forge an unrelated school-duty assigner'
);

select lives_ok(
  $$insert into public.school_duty_assignments(id,tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','late_arrival_recorder',current_date,'fd800000-0000-4000-8000-000000000001')$$,
  'authorized school leader can create a canonical duty assignment'
);

select throws_ok(
  $$update public.school_duty_assignments set assigned_by_user_id='fd800000-0000-4000-8000-000000000002' where id='fd830000-0000-4000-8000-000000000001'$$,
  'School duty assigner provenance is immutable',
  'school-duty creator provenance cannot be rewritten'
);

select lives_ok(
  $$update public.school_duty_assignments set active_to=current_date + 7 where id='fd830000-0000-4000-8000-000000000001'$$,
  'ordinary duty end-date maintenance remains allowed'
);

select ok(
  (select assigned_by_user_id='fd800000-0000-4000-8000-000000000001'::uuid
          and active_to=current_date + 7
     from public.school_duty_assignments
    where id='fd830000-0000-4000-8000-000000000001'),
  'duty lifecycle preserves durable creator provenance'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd800000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','detention_supervisor',current_date,'fd800000-0000-4000-8000-000000000002')$$,
  'School duty assigner must match authenticated actor',
  'authenticated direct write cannot attribute the assignment to another user'
);

reset role;

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_school_duties(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_school_duties(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_school_duty_assignment_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_duty_assignment_actor_integrity()','EXECUTE'),
  'school-duty actor helpers remain private from client roles'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgrelid='public.school_duty_assignments'::regclass
     and tgname='school_duty_assignment_submit_actor_integrity_trg'
     and not tgisinternal),
  1,
  'school-duty actor integrity trigger is installed once'
);

select ok(
  app_private.user_can_manage_school_duties('fd800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222')
  and not app_private.user_can_manage_school_duties('fd800000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222'),
  'arbitrary-user authority mirror matches current school-duty management roles'
);

select * from finish();
rollback;
