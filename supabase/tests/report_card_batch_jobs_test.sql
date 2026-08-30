begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ed000000-0000-4000-8000-000000000001','report-batch-admin@example.test','authenticated','authenticated',now(),now()),
  ('ed000000-0000-4000-8000-000000000002','report-batch-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ed000000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.schools(id,tenant_id,name,status) values
  ('ed100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Batch Other School','active');
insert into public.learners(id,tenant_id,first_names,surname) values
  ('ed200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other','Learner');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status) values
  ('ed300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001',2026,'OTHER-1','2026-01-01','current');

select ok(not has_function_privilege('anon','public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[])','EXECUTE'),'anonymous users cannot create report-card batches');
select ok(has_function_privilege('authenticated','public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[])','EXECUTE'),'authenticated management calls the governed batch creation RPC');
select ok(not has_function_privilege('authenticated','public.process_report_card_batch_items(integer)','EXECUTE'),'authenticated clients cannot execute the batch worker directly');
select ok(has_function_privilege('service_role','public.process_report_card_batch_items(integer)','EXECUTE'),'service role owns batch processing execution');
select ok(not has_table_privilege('authenticated','public.report_card_batches','INSERT'),'authenticated clients cannot insert batch headers directly');
select ok(not has_table_privilege('authenticated','public.report_card_batch_items','UPDATE'),'authenticated clients cannot rewrite batch item outcomes');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,1,'custom','Teacher selection','generate',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'Permission denied','ordinary teachers cannot start report-card bulk mutations');
reset role;

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,1,'custom','Cross-school','generate',array['ed300000-0000-4000-8000-000000000001'::uuid])$$,
  'Every selected learner must have a current enrolment in this school and academic year','a batch cannot include another school enrolment');
select lives_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,1,'custom','Missing results learner','generate',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'management can create a durable generation batch');
reset role;

select is((select count(*)::integer from public.report_card_batches where operation='generate' and scope_label='Missing results learner'),1,'generation batch header is persisted');
select is((select total_items from public.report_card_batches where operation='generate' and scope_label='Missing results learner'),1,'batch records its learner count');
select lives_ok($$select public.process_report_card_batch_items(10)$$,'service worker processes pending report-card batch items');
select is(
  (select i.status from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id where b.scope_label='Missing results learner'),
  'skipped','learner without approved official results is explicitly skipped rather than failing the batch');
select is(
  (select i.result_code from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id where b.scope_label='Missing results learner'),
  'no_approved_results','skip outcome preserves the actionable missing-results reason');
select is((select b.status from public.report_card_batches b where b.scope_label='Missing results learner'),'completed','a fully processed batch with only expected skips completes cleanly');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values(
  'ed400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',2026,1,'SCOLAPRO_TERM_REPORT_V1',1,
  '{}'::jsonb,'draft','ed000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,1,'custom','Certification learner','certify',array['60000000-0000-4000-8000-000000000002'::uuid])$$,
  'management can create a certification batch');
reset role;
select public.process_report_card_batch_items(10);
select is((select status from public.report_card_snapshots where id='ed400000-0000-4000-8000-000000000001'),'certified','batch worker certifies the exact current draft snapshot using the recorded batch actor');

select * from finish();
rollback;
