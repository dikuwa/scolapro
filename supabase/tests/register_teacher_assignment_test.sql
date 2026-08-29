begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb400000-0000-4000-8000-000000000001','register-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb400000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fb410000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','REG-001','No Account','Teacher','active'),
  ('fb410000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','REG-002','Unplaced','Teacher','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb410000-0000-4000-8000-000000000001','teacher','Register Teacher',current_date,'fb400000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub','fb400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  public.assign_register_teacher('40000000-0000-4000-8000-00000000001a','fb410000-0000-4000-8000-000000000001'),
  true,
  'school administrator can assign active school staff as register teacher'
);

select is(
  (select register_teacher_staff_id from public.register_classes where id='40000000-0000-4000-8000-00000000001a'),
  'fb410000-0000-4000-8000-000000000001'::uuid,
  'register teacher assignment uses staff identity even before an Auth account exists'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='register_class' and entity_id='40000000-0000-4000-8000-00000000001a' and event_type='register_class.teacher_assigned'),
  1,
  'register teacher assignment is auditable'
);

select throws_ok(
  $$select public.assign_register_teacher('40000000-0000-4000-8000-00000000001b','fb410000-0000-4000-8000-000000000002')$$,
  'Register teacher is not actively assigned to this school',
  'unplaced staff identity cannot be assigned as register teacher'
);

select is(
  public.assign_register_teacher('40000000-0000-4000-8000-00000000001a',null),
  true,
  'school administrator can deliberately clear a register teacher assignment'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='register_class' and entity_id='40000000-0000-4000-8000-00000000001a' and event_type='register_class.teacher_unassigned'),
  1,
  'register teacher unassignment is auditable'
);

select * from finish();
rollback;