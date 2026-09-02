begin;

select plan(24);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc000000-0000-4000-8000-000000000001','report-lifecycle-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','LIFE-QA','Lifecycle QA Subject','active');

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values (
  'fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'fc100000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'
);

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,symbol,assessment_scheme_key,assessment_scheme_version,academic_rule_set_key,
  academic_rule_set_version,calculation_snapshot,approved_by_user_id
) values (
  'fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  'fc200000-0000-4000-8000-000000000001',1,78,'B','LIFECYCLE_QA','1','LIFECYCLE_QA','1','{}'::jsonb,
  'fc000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch(
    '22222222-2222-4222-8222-222222222222',2026,1,'custom','Lifecycle generate','generate',
    array['60000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'management can create the generation batch'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'worker processes generation batch');
select is(
  (select i.result_code from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id where b.scope_label='Lifecycle generate'),
  'generated','generation batch records generated outcome'
);
select is(
  (select s.status from public.report_card_snapshots s where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and s.status<>'superseded' order by s.snapshot_version desc limit 1),
  'draft','generation creates a draft immutable snapshot'
);
select is(
  (select s.generated_by_user_id from public.report_card_snapshots s where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and s.status<>'superseded' order by s.snapshot_version desc limit 1),
  'fc000000-0000-4000-8000-000000000001'::uuid,'worker preserves initiating administrator as generation actor'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch(
    '22222222-2222-4222-8222-222222222222',2026,1,'custom','Lifecycle certify','certify',
    array['60000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'management can create the certification batch'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'worker processes certification batch');
select is(
  (select s.status from public.report_card_snapshots s where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and s.status<>'superseded' order by s.snapshot_version desc limit 1),
  'certified','certification advances the same snapshot to certified'
);
select is(
  (select s.certified_by_user_id from public.report_card_snapshots s where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and s.status<>'superseded' order by s.snapshot_version desc limit 1),
  'fc000000-0000-4000-8000-000000000001'::uuid,'worker preserves initiating administrator as certification actor'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch(
    '22222222-2222-4222-8222-222222222222',2026,1,'custom','Lifecycle PDF','pdf',
    array['60000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'management can create the PDF preparation batch'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'worker processes PDF preparation batch');
select is(
  (select i.result_code from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id where b.scope_label='Lifecycle PDF'),
  'pdf_queued','PDF batch queues a render rather than manufacturing a document inline'
);
select is(
  (select count(*)::integer from public.report_card_render_jobs j join public.report_card_snapshots s on s.id=j.snapshot_id where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and j.document_format='pdf'),
  1,'exactly one PDF render job exists for the lifecycle snapshot'
);
select is(
  (select count(*)::integer from public.claim_report_card_batch_exports(1)),
  0,'combined export cannot be claimed before the learner PDF is ready'
);

select is(
  (select count(*)::integer from public.claim_report_card_render_jobs(10,'pdf')),
  1,'render worker can claim the queued learner PDF job'
);
select lives_ok(
  $$select public.complete_report_card_render_job(
    (select j.id from public.report_card_render_jobs j join public.report_card_snapshots s on s.id=j.snapshot_id
      where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and j.document_format='pdf' limit 1),
    'report-card-artifacts','qa/lifecycle-report.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1
  )$$,
  'render worker can register the ready learner PDF'
);
select is(
  (select count(*)::integer from public.report_card_documents d join public.report_card_snapshots s on s.id=d.snapshot_id
    where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and d.document_format='pdf' and d.status='ready'),
  1,'render completion creates one ready PDF document'
);
select is(
  (select count(*)::integer from public.claim_report_card_batch_exports(1)),
  1,'combined export becomes claimable only after the learner PDF is ready'
);
select lives_ok(
  $$select public.complete_report_card_batch_export(
    (select id from public.report_card_batches where scope_label='Lifecycle PDF' order by created_at desc limit 1),
    'report-card-artifacts','qa/lifecycle-batch.zip','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1
  )$$,
  'export worker can complete the claimed combined artifact'
);
select is(
  (select export_status from public.report_card_batches where scope_label='Lifecycle PDF' order by created_at desc limit 1),
  'ready','PDF batch records its combined export as ready'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch(
    '22222222-2222-4222-8222-222222222222',2026,1,'custom','Lifecycle publish','publish',
    array['60000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'management can create the publication batch after PDF preparation'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'worker processes publication batch');
select is(
  (select s.status from public.report_card_snapshots s where s.enrolment_id='60000000-0000-4000-8000-000000000001' and s.term_number=1 and s.status<>'superseded' order by s.snapshot_version desc limit 1),
  'published','publication releases the certified snapshot after the durable PDF stages'
);
select is(
  (select count(*)::integer from public.audit_events where actor_user_id='fc000000-0000-4000-8000-000000000001' and event_type in (
    'report_card.snapshot.generated','report_card.snapshot.certified','report_card.render.queued','report_card.batch.export.ready','report_card.snapshot.published'
  )),
  5,'the lifecycle leaves durable actor-attributed audit evidence for every major stage'
);

select * from finish();
rollback;
