begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fcd00000-0000-4000-8000-000000000001','my-detention-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcd00000-0000-4000-8000-000000000002','my-detention-supervisor@example.test','authenticated','authenticated',now(),now()),
  ('fcd00000-0000-4000-8000-000000000003','my-detention-peer@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcd00000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fcd10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcd00000-0000-4000-8000-000000000002','MYDET-1','Assigned','Supervisor','active'),
  ('fcd10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fcd00000-0000-4000-8000-000000000003','MYDET-2','Peer','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fcd20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fcd00000-0000-4000-8000-000000000001'),
  ('fcd20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd10000-0000-4000-8000-000000000002','teacher','2026-01-01',null,'fcd00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fcd30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Alpha','Learner'),
  ('fcd30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Beta','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fcd40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
  ('fcd40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000002',2026,'2026-01-01','current');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id,rollover_count
) values
  ('fcd50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000001',3,'2026-03-06','pending',2026,'2026-03-02','2026-03-06','fcd10000-0000-4000-8000-000000000001',0),
  ('fcd50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000002',3,'2026-03-13','carried_forward',2026,'2026-03-05','2026-03-06','fcd10000-0000-4000-8000-000000000001',1),
  ('fcd50000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000001',3,'2026-02-20','completed',2026,'2026-02-16','2026-02-20','fcd10000-0000-4000-8000-000000000001',0),
  ('fcd50000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcd30000-0000-4000-8000-000000000002',3,'2026-03-20','pending',2026,'2026-03-16','2026-03-20','fcd10000-0000-4000-8000-000000000002',0);

select ok(
  to_regprocedure('public.list_my_detention_supervision(boolean,integer,integer)') is not null,
  'self-scoped detention supervision RPC exists'
);
select ok(
  has_function_privilege('authenticated','public.list_my_detention_supervision(boolean,integer,integer)','EXECUTE')
  and not has_function_privilege('anon','public.list_my_detention_supervision(boolean,integer,integer)','EXECUTE'),
  'self-scoped detention supervision RPC is authenticated-only'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcd00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_detention_supervision()),
  2,
  'default read returns only unresolved obligations assigned to the signed-in staff member'
);
select is(
  (select min(total_count)::integer from public.list_my_detention_supervision()),
  2,
  'default total count reflects only the caller scoped unresolved set'
);
select is(
  (select learner_first_names from public.list_my_detention_supervision() order by due_on limit 1),
  'Alpha',
  'assigned supervisor receives minimal learner identity required for supervision'
);
select is(
  (select count(*)::integer from public.list_my_detention_supervision() where can_complete),
  2,
  'due-date-valid active placement marks both unresolved assignments completable'
);
select is(
  (select count(*)::integer from public.list_my_detention_supervision(true,1,25)),
  3,
  'resolved history is included only when explicitly requested'
);
select is(
  (select count(*)::integer from public.list_my_detention_supervision(true,1,1)),
  1,
  'page size bounds the returned rows'
);
select is(
  (select total_count::integer from public.list_my_detention_supervision(true,1,1) limit 1),
  3,
  'paged rows preserve total caller-scoped result count'
);
select is(
  (select count(*)::integer from public.list_my_detention_supervision(true,2,1)),
  1,
  'second page remains available without broadening caller scope'
);
select is(
  (select count(*)::integer from public.list_my_detention_supervision(true,1,25)
   where obligation_id='fcd50000-0000-4000-8000-000000000004'),
  0,
  'caller never receives a peer supervisor assignment'
);

reset role;
update public.staff_school_assignments
set effective_to='2026-03-09'
where id='fcd20000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcd00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select can_complete from public.list_my_detention_supervision() where obligation_id='fcd50000-0000-4000-8000-000000000002'),
  false,
  'assignment remains visible but is not completable when placement is invalid on its due date'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcd00000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_detention_supervision()),
  1,
  'peer staff sees only their own unresolved assignment'
);
select is(
  (select learner_first_names from public.list_my_detention_supervision() limit 1),
  'Beta',
  'peer self-scope returns only the learner attached to the peer assignment'
);
select is(
  (select total_count::integer from public.list_my_detention_supervision() limit 1),
  1,
  'peer total count cannot reveal another supervisor assignment volume'
);

reset role;
select * from finish();
rollback;
