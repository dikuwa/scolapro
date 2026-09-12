begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fde00000-0000-4000-8000-000000000001','report-batch-stale-admin@example.test','authenticated','authenticated',now(),now()),
('fde00000-0000-4000-8000-000000000002','report-batch-support@example.test','authenticated','authenticated',now(),now()),
('fde00000-0000-4000-8000-000000000003','report-batch-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report Batch Current School','RPT-BATCH-CURRENT','active');

-- School A is initially current so the historical batch has legitimate provenance.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde00000-0000-4000-8000-000000000001','school_admin',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from) values
('fde00000-0000-4000-8000-000000000002','platform_support',current_date),
('fde00000-0000-4000-8000-000000000003','platform_admin',current_date);

insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,
  total_items,processed_items,failed_items,created_by_user_id,export_status,export_error
) values (
  'fde20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,1,'custom','Current-school retry fixture','pdf','partial',1,1,1,
  'fde00000-0000-4000-8000-000000000001','failed','fixture failure'
);

insert into public.report_card_batch_items(
  id,batch_id,tenant_id,school_id,enrolment_id,learner_id,status,result_code,message,completed_at
) values (
  'fde30000-0000-4000-8000-000000000001','fde20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  'failed','error','fixture failure',now()
);

-- A later active membership becomes deterministic current school under #411/#416.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','fde00000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is((select count(*)::integer from public.report_card_batches where id='fde20000-0000-4000-8000-000000000001'),0,
  'administrator cannot read a batch from an older still-active non-current school');
select is((select count(*)::integer from public.report_card_batch_items where id='fde30000-0000-4000-8000-000000000001'),0,
  'administrator cannot read batch items from an older still-active non-current school');
select throws_ok(
  $$select * from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'school',null)$$,
  'P0001','Permission denied','management summary cannot target an older active non-current school');
select throws_ok(
  $$select * from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,50)$$,
  'P0001','Permission denied','SECURITY DEFINER status paging cannot target an older active non-current school');
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'publish')$$,
  'P0001','Report-card batch creator is not authorized for school','bulk publication cannot be created for an older active non-current school');
select throws_ok(
  $$select public.retry_report_card_batch_failures('fde20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied','failed learner work cannot be retried in an older active non-current school');
select throws_ok(
  $$select public.retry_report_card_batch_export('fde20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied','failed combined export cannot be retried in an older active non-current school');
reset role;

select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where id='fde20000-0000-4000-8000-000000000001'),0,
  'platform_support cannot read school report-card batches');
select throws_ok(
  $$select public.retry_report_card_batch_export('fde20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied','platform_support cannot retry school report-card exports');
reset role;

select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where id='fde20000-0000-4000-8000-000000000001'),1,
  'platform_admin retains governed cross-school batch visibility');
select is(public.retry_report_card_batch_failures('fde20000-0000-4000-8000-000000000001'),1,
  'platform_admin retains governed cross-school failed-item retry authority');
select is(public.retry_report_card_batch_export('fde20000-0000-4000-8000-000000000001'),true,
  'platform_admin retains governed cross-school export retry authority');
reset role;

select is(
  (select created_by_user_id from public.report_card_batches where id='fde20000-0000-4000-8000-000000000001'),
  'fde00000-0000-4000-8000-000000000001'::uuid,
  'retry processing preserves original batch actor provenance'
);

select * from finish();
rollback;
