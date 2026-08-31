begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('eb000000-0000-4000-8000-000000000001','status-admin@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000002','status-teacher@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000003','status-platform-support@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000004','status-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('eb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Status Boundary School','TST-RPT-STATUS-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','eb100000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','eb100000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('eb000000-0000-4000-8000-000000000003','platform_support',current_date),
  ('eb000000-0000-4000-8000-000000000004','platform_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values('eb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Status','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status)
values('eb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','eb100000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001',2026,'STATUS-001','2026-01-01','current');

select ok(
  not has_function_privilege('anon','public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer)','EXECUTE'),
  'anonymous users cannot execute the report-card status roster'
);
select ok(
  has_function_privilege('authenticated','public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer)','EXECUTE'),
  'authenticated callers enter through the self-authorizing status RPC'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50)),
  1,
  'an active teacher school member retains the paged roster read used by the report workspace'
);
reset role;

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50)$$,
  'Permission denied',
  'platform support cannot turn support-safe school access into learner roster enumeration'
);
reset role;

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50)),
  1,
  'school administrator can read the status roster'
);
select is(
  (select learner_id from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50) limit 1),
  'eb200000-0000-4000-8000-000000000001'::uuid,
  'school administrator receives the expected learner row'
);
reset role;

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50)),
  1,
  'platform administrator retains governed cross-school status access'
);
select is(
  (select total_count::integer from public.list_report_card_status_page('eb100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50) limit 1),
  1,
  'platform administrator receives the correct bounded total'
);
reset role;

select * from finish();
rollback;
