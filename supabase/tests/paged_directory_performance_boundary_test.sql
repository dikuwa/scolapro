begin;

select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','performance-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','PERF-001','Alpha','Performance','active'),
  ('fa100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','PERF-002','Beta','Performance','active');

insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','teacher','2026-01-01','fa000000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000002','teacher','2026-01-01','fa000000-0000-4000-8000-000000000001');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Alpha','Guardian','PERF-G-001'),
  ('fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Beta','Guardian','PERF-G-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values
  ('fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','mother',1,'2026-01-01'),
  ('fa300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000002','father',1,'2026-01-01');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(*)::integer from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222',2026,null,'current',null,null,null,false,1,1)),
  1,
  'learner directory returns only the requested page size'
);

select is(
  (select total_count::integer from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222',2026,null,'current',null,null,null,false,1,1)),
  (select count(*)::integer from public.enrolments where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and status='current'),
  'learner page retains the complete filtered total count'
);

select isnt(
  (select learner_id from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222',2026,null,'current',null,null,null,false,1,1)),
  (select learner_id from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222',2026,null,'current',null,null,null,false,2,1)),
  'successive learner pages do not repeat the same row'
);

select is(
  (select count(*)::integer from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222',2026,'DEMO-001','current',null,null,null,false,1,50)),
  1,
  'learner search executes before pagination'
);

select is(
  (select count(*)::integer from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222',null,1,1)),
  1,
  'staff directory returns only the requested page size'
);

select is(
  (select total_count::integer from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222',null,1,1)),
  (select total_staff::integer from public.get_staff_directory_summary('22222222-2222-4222-8222-222222222222','2026-08-31')),
  'staff page total agrees with school-wide summary semantics'
);

select isnt(
  (select row_id from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222',null,1,1)),
  (select row_id from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222',null,2,1)),
  'successive staff pages do not repeat the same person'
);

select is(
  (select count(*)::integer from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222','PERF-002',1,50)),
  1,
  'staff search executes before pagination'
);

select like(
  (select suggested_employee_number from public.get_staff_directory_summary('22222222-2222-4222-8222-222222222222','2026-08-31')),
  'EMP-%',
  'staff summary keeps a school-wide editable EMP number suggestion'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page('22222222-2222-4222-8222-222222222222','Guardian',1,1)),
  1,
  'guardian directory returns only the requested page size'
);

select is(
  (select total_count::integer from public.search_guardian_directory_page('22222222-2222-4222-8222-222222222222','Guardian',1,1)),
  2,
  'guardian page reports the complete authorized filtered total'
);

select isnt(
  (select guardian_id from public.search_guardian_directory_page('22222222-2222-4222-8222-222222222222','Guardian',1,1)),
  (select guardian_id from public.search_guardian_directory_page('22222222-2222-4222-8222-222222222222','Guardian',2,1)),
  'successive guardian pages do not repeat the same guardian'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page('22222222-2222-4222-8222-222222222222','PERF-G-002',1,50)),
  1,
  'guardian identity/contact/learner search executes before pagination'
);

select throws_ok(
  $$select * from public.list_learner_directory_page('ffffffff-ffff-4fff-8fff-ffffffffffff',2026,null,'current',null,null,null,false,1,50)$$,
  'Permission denied',
  'learner paging refuses a school outside the caller scope'
);

select throws_ok(
  $$select * from public.list_staff_directory_page('ffffffff-ffff-4fff-8fff-ffffffffffff',null,1,50)$$,
  'Permission denied',
  'staff paging refuses a school outside the caller scope'
);

select throws_ok(
  $$select * from public.search_guardian_directory_page('ffffffff-ffff-4fff-8fff-ffffffffffff',null,1,50)$$,
  'Permission denied',
  'guardian paging refuses a school outside the caller scope'
);

select ok(
  not has_function_privilege('anon','public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer)','EXECUTE')
  and not has_function_privilege('anon','public.list_staff_directory_page(uuid,text,integer,integer)','EXECUTE'),
  'anonymous clients cannot execute learner or staff paged directory RPCs'
);

select ok(
  not has_function_privilege('anon','public.search_guardian_directory_page(uuid,text,integer,integer)','EXECUTE'),
  'anonymous clients cannot execute guardian paged directory RPC'
);

select * from finish();
rollback;
