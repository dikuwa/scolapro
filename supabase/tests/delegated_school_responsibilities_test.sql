begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdc00000-0000-4000-8000-000000000001','delegation-manager@example.test','authenticated','authenticated',now(),now()),
  ('fdc00000-0000-4000-8000-000000000002','delegation-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fdc00000-0000-4000-8000-000000000003','delegation-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fdc10000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'fdc00000-0000-4000-8000-000000000002',
  'DELEGATE-001','Delegated','Teacher','active'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
) values
(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdc00000-0000-4000-8000-000000000001',
  null,'school_admin',current_date-30,null
),
(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdc00000-0000-4000-8000-000000000002',
  'fdc10000-0000-4000-8000-000000000002',
  'teacher',current_date-30,null
);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdc10000-0000-4000-8000-000000000002',
  'staff',current_date-30,null,
  'fdc00000-0000-4000-8000-000000000001'
);

select is(
  (select count(*)::integer from public.list_school_duty_capabilities() where duty_key='late_arrival_recorder'),
  1,
  'bounded late-arrival capability is discoverable'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000003',true);
set local role authenticated;

select throws_ok(
  $$select public.assign_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'fdc10000-0000-4000-8000-000000000002'::uuid,
    'late_arrival_recorder',
    current_date,
    null
  )$$,
  'P0001',
  'Permission denied',
  'non-leadership user cannot assign school duties'
);

reset role;
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.assign_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'fdc10000-0000-4000-8000-000000000002'::uuid,
    'late_arrival_recorder',
    current_date-1,
    null
  )$$,
  'school leadership can assign a bounded responsibility'
);

select throws_ok(
  $$select public.assign_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'fdc10000-0000-4000-8000-000000000002'::uuid,
    'unregistered_super_power',
    current_date,
    null
  )$$,
  'P0001',
  'Duty capability is not assignable',
  'unregistered duty keys cannot be assigned'
);

select throws_ok(
  $$select public.assign_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'fdc10000-0000-4000-8000-000000000002'::uuid,
    'late_arrival_recorder',
    current_date,
    null
  )$$,
  'P0001',
  'This staff member already has an overlapping duty assignment',
  'overlapping responsibility assignments fail safely'
);

select is(
  (select count(*)::integer
   from public.list_school_duty_assignments(
     '22222222-2222-4222-8222-222222222222'::uuid,current_date
   )
   where staff_member_id='fdc10000-0000-4000-8000-000000000002'
     and currently_effective),
  1,
  'leadership workspace lists the current delegated responsibility'
);

select is(
  (select role_key
   from public.school_memberships
   where user_id='fdc00000-0000-4000-8000-000000000002'
     and school_id='22222222-2222-4222-8222-222222222222'
   limit 1),
  'teacher',
  'delegation does not change the staff member base role'
);

reset role;
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select ok(
  app_private.has_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'late_arrival_recorder',
    current_date
  ),
  'delegated authority is effective for the assignee while placement and dates are current'
);

reset role;
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  format(
    'select public.end_school_duty(%L::uuid,%L::date)',
    (
      select assignment_id
      from public.list_school_duty_assignments(
        '22222222-2222-4222-8222-222222222222'::uuid,
        current_date
      )
      where staff_member_id='fdc10000-0000-4000-8000-000000000002'
        and duty_key='late_arrival_recorder'
      order by active_from desc
      limit 1
    ),
    current_date-1
  ),
  'leadership can end a responsibility without deleting its history'
);

reset role;
select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  app_private.has_school_duty(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'late_arrival_recorder',
    current_date
  ),
  false,
  'ended duty no longer grants operational authority'
);

reset role;
select * from finish();
rollback;
