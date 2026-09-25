begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdd00000-0000-4000-8000-000000000001','crc688-admin@example.test','authenticated','authenticated',now(),now()),
  ('fdd00000-0000-4000-8000-000000000002','crc688-register@example.test','authenticated','authenticated',now(),now()),
  ('fdd00000-0000-4000-8000-000000000003','crc688-other@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fdd10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fdd00000-0000-4000-8000-000000000002','CRC688-REG','Register','Teacher','active'),
  ('fdd10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fdd00000-0000-4000-8000-000000000003','CRC688-OTH','Other','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000001',null,'school_admin',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000002','fdd10000-0000-4000-8000-000000000002','class_teacher',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd00000-0000-4000-8000-000000000003','fdd10000-0000-4000-8000-000000000003','teacher',current_date-30);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd10000-0000-4000-8000-000000000002','teacher',current_date-30,'fdd00000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdd10000-0000-4000-8000-000000000003','teacher',current_date-30,'fdd00000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.assign_register_teacher(
    '40000000-0000-4000-8000-00000000001a'::uuid,
    'fdd10000-0000-4000-8000-000000000002'::uuid
  ),
  true,
  'leadership assigns the current register teacher through the canonical class model'
);

reset role;
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::integer
   from public.get_my_crc_contribution_context(
     '50000000-0000-4000-8000-000000000001'::uuid,
     '22222222-2222-4222-8222-222222222222'::uuid
   )),
  1,
  'assigned register teacher receives current learner contribution context'
);

select lives_ok(
  $$select public.append_crc_routine_contribution(
    '60000000-0000-4000-8000-000000000001'::uuid,
    'overall_impression',
    'Shows steady participation in class routines.',
    'Routine class-teacher follow-up recorded.'
  )$$,
  'register teacher can append routine CRC observations'
);

select is(
  (select count(*)::integer
   from public.learner_development_observations
   where learner_id='50000000-0000-4000-8000-000000000001'
     and recorded_by_user_id='fdd00000-0000-4000-8000-000000000002'),
  1,
  'routine contribution writes the canonical development observation table'
);

select is(
  (select count(*)::integer
   from public.learner_cumulative_notes
   where learner_id='50000000-0000-4000-8000-000000000001'
     and recorded_by_user_id='fdd00000-0000-4000-8000-000000000002'
     and sensitivity='routine'),
  1,
  'optional class-teacher remark is stored only as routine CRC content'
);

reset role;
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000003',true);
set local role authenticated;

select throws_ok(
  $$select public.append_crc_routine_contribution(
    '60000000-0000-4000-8000-000000000001'::uuid,
    'social',
    'Attempted out-of-scope contribution.',
    null
  )$$,
  'P0001',
  'Permission denied: current register-teacher authority required',
  'ordinary teacher cannot contribute outside current register-class authority'
);

reset role;
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select ok(
  (public.get_crc_administration_summary(
    '22222222-2222-4222-8222-222222222222'::uuid
  )->>'leadership_oversight')::boolean,
  'leadership receives administrative CRC readiness'
);

select is(
  public.get_crc_administration_summary(
    '22222222-2222-4222-8222-222222222222'::uuid
  ) ? 'confidential_case_details',
  false,
  'administrative summary exposes no confidential case detail field'
);

select ok(
  (select count(*) >= 1
   from public.list_crc_class_completeness(
     '22222222-2222-4222-8222-222222222222'::uuid
   )),
  'leadership can inspect class-level routine contribution follow-up counts'
);

reset role;
select * from finish();
rollback;
