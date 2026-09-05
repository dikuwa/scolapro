begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fed00000-0000-4000-8000-000000000001','render-actor-admin@example.test','authenticated','authenticated',now(),now()),
  ('fed00000-0000-4000-8000-000000000002','render-actor-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fed00000-0000-4000-8000-000000000003','render-actor-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fed00000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fed00000-0000-4000-8000-000000000002','teacher',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fed00000-0000-4000-8000-000000000003','principal',current_date-1);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values (
  'fed10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  2026,1,'RENDER_ACTOR_TEST',991,'{}'::jsonb,'certified',
  'fed00000-0000-4000-8000-000000000001','fed00000-0000-4000-8000-000000000001',now()
);

select lives_ok(
  $$insert into public.report_card_render_jobs(
      id,tenant_id,school_id,snapshot_id,template_key,template_version,document_format,requested_by_user_id
    ) values(
      'fed20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fed10000-0000-4000-8000-000000000001','SCOLAPRO_TERM_REPORT_V1','1','pdf','fed00000-0000-4000-8000-000000000001'
    )$$,
  'trusted writer accepts an explicitly attributed authorized report manager'
);

select throws_ok(
  $$insert into public.report_card_render_jobs(
      tenant_id,school_id,snapshot_id,template_key,template_version,document_format,requested_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fed10000-0000-4000-8000-000000000001','FORGED_TEACHER','1','pdf','fed00000-0000-4000-8000-000000000002'
    )$$,
  'Report-card render requester is not authorized for school',
  'trusted writer cannot attribute a render request to an ordinary teacher'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fed00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$insert into public.report_card_render_jobs(
      tenant_id,school_id,snapshot_id,template_key,template_version,document_format,requested_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fed10000-0000-4000-8000-000000000001','SPOOFED_PRINCIPAL','1','pdf','fed00000-0000-4000-8000-000000000003'
    )$$,
  'Report-card render requester must match authenticated actor',
  'authenticated manager cannot spoof another authorized requester'
);

set local role authenticated;
select lives_ok(
  $$select public.queue_report_card_render(
      'fed10000-0000-4000-8000-000000000001','SCOLAPRO_TERM_REPORT_V1','2','pdf'
    )$$,
  'governed queue RPC remains usable by an authorized school administrator'
);
reset role;

select is(
  (select requested_by_user_id from public.report_card_render_jobs where template_version='2' and snapshot_id='fed10000-0000-4000-8000-000000000001'),
  'fed00000-0000-4000-8000-000000000001'::uuid,
  'queued render request preserves the authenticated manager as requester'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_report_card_render_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_render_actor_integrity()','EXECUTE'),
  'render actor-integrity trigger helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid='public.report_card_render_jobs'::regclass
     and tgname='zz_report_card_render_actor_integrity_trg'
     and not tgisinternal),
  1,
  'report-card render outbox has one physical requester provenance guard'
);

select * from finish();
rollback;
