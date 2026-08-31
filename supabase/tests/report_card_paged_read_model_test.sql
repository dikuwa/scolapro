begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ef000000-0000-4000-8000-000000000001','paged-report-admin@example.test','authenticated','authenticated',now(),now()),
  ('ef000000-0000-4000-8000-000000000002','paged-report-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ef000000-0000-4000-8000-000000000003','paged-report-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status) values
  ('ef100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Paged Report Other School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef000000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
  ('ef200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'PAGED-G8','Paged Grade 8');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name) values
  ('ef300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef200000-0000-4000-8000-000000000001',2026,'PAGED-8A','Paged 8A');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ef400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Paged','Alpha'),
  ('ef400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Paged','Beta');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status) values
  ('ef500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef400000-0000-4000-8000-000000000001',2026,'ef200000-0000-4000-8000-000000000001','ef300000-0000-4000-8000-000000000001','PAGED-1','2026-01-01','current'),
  ('ef500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef400000-0000-4000-8000-000000000002',2026,'ef200000-0000-4000-8000-000000000001',null,'PAGED-2','2026-01-01','current');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values(
  'ef600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'ef400000-0000-4000-8000-000000000001','ef500000-0000-4000-8000-000000000001',2026,1,'SCOLAPRO_TERM_REPORT_V1',1,'{}'::jsonb,'draft','ef000000-0000-4000-8000-000000000001');

select ok(not has_function_privilege('anon','public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer)','EXECUTE'),'anonymous users cannot call the paged report status model');
select ok(has_function_privilege('authenticated','public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer)','EXECUTE'),'authenticated users can call the governed paged report status model');
select ok(not has_function_privilege('anon','public.get_report_card_scope_summary(uuid,integer,integer,text,uuid)','EXECUTE'),'anonymous users cannot call report-card scope summaries');
select ok(has_function_privilege('authenticated','public.get_report_card_scope_summary(uuid,integer,integer,text,uuid)','EXECUTE'),'authenticated users can call the governed scope-summary RPC');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'Paged',null,null,'all',1,1)),
  1,
  'paged status read returns only the requested page size');
select is(
  (select total_count::integer from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'Paged',null,null,'all',1,1) limit 1),
  2,
  'paged status read returns total count without returning the full roster');
select is(
  (select total_count::integer from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'Paged','ef200000-0000-4000-8000-000000000001',null,'all',1,50) limit 1),
  2,
  'grade filter is resolved in PostgreSQL before pagination');
select is(
  (select total_count::integer from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'Paged',null,'ef300000-0000-4000-8000-000000000001','all',1,50) limit 1),
  1,
  'register-class filter is resolved in PostgreSQL before pagination');
select is(
  (select total_count::integer from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'Paged',null,null,'generated',1,50) limit 1),
  1,
  'report status filter is resolved from the latest visible snapshot before pagination');
select is(
  (select total_count::integer from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'grade','ef200000-0000-4000-8000-000000000001')),
  2,
  'management grade summary counts current enrolments without returning learner rows');
select is(
  (select generated_count::integer from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'grade','ef200000-0000-4000-8000-000000000001')),
  1,
  'management grade summary counts generated drafts');
select is(
  (select not_generated_count::integer from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'grade','ef200000-0000-4000-8000-000000000001')),
  1,
  'management grade summary counts learners without a current snapshot');
select is(
  (select total_count::integer from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'class','ef300000-0000-4000-8000-000000000001')),
  1,
  'management class summary respects register-class scope');
reset role;

select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select report_status from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,'PAGED-1',null,null,'all',1,50) where enrolment_id='ef500000-0000-4000-8000-000000000001'),
  'not_generated',
  'an unassigned teacher does not gain visibility into an otherwise existing draft snapshot through the security-definer page RPC');
select throws_ok(
  $$select * from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'school',null)$$,
  'Permission denied','ordinary teachers cannot read management-wide aggregate report status');
reset role;

select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,50)$$,
  'Permission denied','a legitimate administrator of another school cannot page this school report-card status');
select throws_ok(
  $$select * from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'school',null)$$,
  'Permission denied','a legitimate administrator of another school cannot read this school report-card summary');
select lives_ok(
  $$select * from public.list_report_card_status_page('ef100000-0000-4000-8000-000000000001',2026,1,null,null,null,'all',1,50)$$,
  'the other-school administrator can use the paged model for their own school');
reset role;

select * from finish();
rollback;