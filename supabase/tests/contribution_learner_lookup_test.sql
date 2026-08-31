begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fb000000-0000-4000-8000-000000000001','contribution-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000002','contribution-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000002','CONTRIB-T01','Contrib','Teacher','active');

insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb100000-0000-4000-8000-000000000001','teacher','2026-01-01','fb000000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001',null,'school_admin','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001','class_teacher','2026-01-01');

update public.register_classes
set register_teacher_staff_id='fb100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(*)::integer from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,null,20)),
  2,
  'school leadership can search the complete current school roster'
);

select is(
  (select count(*)::integer from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,null,1)),
  1,
  'contribution learner lookup respects the requested bounded result size'
);

select is(
  (select count(*)::integer from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,'DEMO-002',20)),
  1,
  'contribution learner search executes at the database before the result bound'
);

select throws_ok(
  $$select * from public.search_contribution_eligible_learners('ffffffff-ffff-4fff-8fff-ffffffffffff',2026,null,20)$$,
  'Permission denied',
  'leadership cannot search a school outside its membership scope'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);

select is(
  (select count(*)::integer from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,null,20)),
  1,
  'class teacher lookup is restricted to learners in assigned register classes'
);

select is(
  (select learner_id from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,null,20)),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'class teacher receives the learner from the assigned class'
);

select is(
  (select count(*)::integer from public.search_contribution_eligible_learners('22222222-2222-4222-8222-222222222222',2026,'DEMO-002',20)),
  0,
  'class teacher search cannot discover a learner in another register class'
);

select throws_ok(
  $$select * from public.search_contribution_eligible_learners('ffffffff-ffff-4fff-8fff-ffffffffffff',2026,null,20)$$,
  'Permission denied',
  'class teacher cannot search another school'
);

select ok(
  not has_function_privilege('anon','public.search_contribution_eligible_learners(uuid,integer,text,integer)','EXECUTE'),
  'anonymous clients cannot execute the contribution learner lookup'
);

select * from finish();
rollback;