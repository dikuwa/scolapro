begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ee000000-0000-4000-8000-000000000001','role-matrix-admin@example.test','authenticated','authenticated',now(),now()),
  ('ee000000-0000-4000-8000-000000000002','role-matrix-principal@example.test','authenticated','authenticated',now(),now()),
  ('ee000000-0000-4000-8000-000000000003','role-matrix-deputy@example.test','authenticated','authenticated',now(),now()),
  ('ee000000-0000-4000-8000-000000000004','role-matrix-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('ee100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report Role Matrix School','TST-RPT-ROLE-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000002','principal',current_date),
  ('11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000003','deputy_principal',current_date),
  ('11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000004','teacher',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values('ee200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Role','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status)
values('ee300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ee100000-0000-4000-8000-000000000001','ee200000-0000-4000-8000-000000000001',2026,'ROLE-MATRIX-001','2026-01-01','current');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select total_count::integer from public.get_report_card_scope_summary('ee100000-0000-4000-8000-000000000001',2026,1,'school',null)),
  1,
  'school administrator receives the managed whole-school report-card summary'
);
select lives_ok(
  $$select public.create_report_card_batch_for_scope('ee100000-0000-4000-8000-000000000001',2026,1,'school',null,'generate')$$,
  'school administrator can create a server-resolved report-card batch'
);
reset role;

select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select total_count::integer from public.get_report_card_scope_summary('ee100000-0000-4000-8000-000000000001',2026,1,'school',null)),
  1,
  'principal receives the managed whole-school report-card summary'
);
select lives_ok(
  $$select public.create_report_card_batch_for_scope('ee100000-0000-4000-8000-000000000001',2026,1,'school',null,'generate')$$,
  'principal can create a server-resolved report-card batch'
);
reset role;

select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select total_count::integer from public.get_report_card_scope_summary('ee100000-0000-4000-8000-000000000001',2026,1,'school',null)),
  1,
  'deputy principal receives the managed whole-school report-card summary'
);
select lives_ok(
  $$select public.create_report_card_batch_for_scope('ee100000-0000-4000-8000-000000000001',2026,1,'school',null,'generate')$$,
  'deputy principal can create a server-resolved report-card batch'
);
reset role;

select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_report_card_scope_summary('ee100000-0000-4000-8000-000000000001',2026,1,'school',null)$$,
  'Permission denied',
  'teacher cannot access the management-only scope summary'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('ee100000-0000-4000-8000-000000000001',2026,1,'school',null,'generate')$$,
  'Permission denied',
  'teacher cannot create a management report-card batch'
);
reset role;

select * from finish();
rollback;
