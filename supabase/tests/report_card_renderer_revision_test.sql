begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fea00000-0000-4000-8000-000000000001','renderer-revision-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000001','school_admin',current_date-1);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values (
  'fea10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  2026,1,'SCOLAPRO_TERM_REPORT_V1',992,'{}'::jsonb,'certified',
  'fea00000-0000-4000-8000-000000000001','fea00000-0000-4000-8000-000000000001',now()
);

select is(
  app_private.current_report_card_renderer_version(),
  'SCOLAPRO_TERM_REPORT_RENDERER_V5'::text,
  'current renderer revision is explicit and independent from snapshot template version'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_card_render_jobs' and column_name='renderer_version'),
  'render jobs store renderer revision'
);
select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_card_documents' and column_name='renderer_version'),
  'documents store renderer revision'
);
select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_card_batches' and column_name='export_renderer_version'),
  'combined exports store renderer revision'
);

insert into public.report_card_render_jobs(
  id,tenant_id,school_id,snapshot_id,template_key,template_version,renderer_version,document_format,requested_by_user_id
) values(
  'fea20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fea10000-0000-4000-8000-000000000001','TERM_REPORT','SCOLAPRO_TERM_REPORT_V1','SCOLAPRO_TERM_REPORT_RENDERER_LEGACY','pdf',
  'fea00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.queue_report_card_render('fea10000-0000-4000-8000-000000000001','TERM_REPORT','SCOLAPRO_TERM_REPORT_V1','pdf')$$,
  'current renderer job can coexist with a legacy job for the same immutable snapshot'
);
reset role;

select is(
  (select renderer_version from public.report_card_render_jobs
   where snapshot_id='fea10000-0000-4000-8000-000000000001' and renderer_version<>'SCOLAPRO_TERM_REPORT_RENDERER_LEGACY' limit 1),
  'SCOLAPRO_TERM_REPORT_RENDERER_V5'::text,
  'governed queue stamps the current renderer revision'
);

select is(
  (select count(*)::integer from public.report_card_render_jobs
   where snapshot_id='fea10000-0000-4000-8000-000000000001'),
  2,
  'legacy and current render jobs are both retained'
);

select is(
  (select renderer_version from public.claim_report_card_render_jobs(10,'pdf')
   where snapshot_id='fea10000-0000-4000-8000-000000000001' limit 1),
  'SCOLAPRO_TERM_REPORT_RENDERER_V5'::text,
  'worker claim ignores legacy pending jobs and takes the current revision'
);

select lives_ok(
  $$select public.complete_report_card_render_job(
      (select id from public.report_card_render_jobs
       where snapshot_id='fea10000-0000-4000-8000-000000000001'
         and renderer_version='SCOLAPRO_TERM_REPORT_RENDERER_V5'),
      'report-card-artifacts','revision-test/current.pdf',null,1
    )$$,
  'current renderer job completes into a durable artifact'
);

select is(
  (select renderer_version from public.report_card_documents
   where snapshot_id='fea10000-0000-4000-8000-000000000001' and status='ready' order by created_at desc limit 1),
  'SCOLAPRO_TERM_REPORT_RENDERER_V5'::text,
  'completed document preserves the renderer revision'
);

select * from finish();
rollback;
