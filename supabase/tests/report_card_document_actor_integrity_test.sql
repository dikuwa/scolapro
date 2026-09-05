begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fef00000-0000-4000-8000-000000000001','document-actor-admin@example.test','authenticated','authenticated',now(),now()),
  ('fef00000-0000-4000-8000-000000000002','document-actor-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fef00000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fef00000-0000-4000-8000-000000000002','teacher',current_date-1);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values (
  'fef10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,
  'DOCUMENT_ACTOR_TEST',993,'{}'::jsonb,'certified','fef00000-0000-4000-8000-000000000001',
  'fef00000-0000-4000-8000-000000000001',now()
);

select lives_ok(
  $$insert into public.report_card_documents(
      id,tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
      storage_bucket,storage_path,status,generated_by_user_id
    ) values(
      'fef20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fef10000-0000-4000-8000-000000000001','DOCUMENT_ACTOR_TEST','1','pdf','report-card-artifacts',
      'actor-test/authorized.pdf','ready','fef00000-0000-4000-8000-000000000001'
    )$$,
  'trusted worker may attribute a ready report artifact to an authorized report manager'
);

select throws_ok(
  $$insert into public.report_card_documents(
      tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
      storage_bucket,storage_path,status,generated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fef10000-0000-4000-8000-000000000001','DOCUMENT_ACTOR_TEST','1','pdf','report-card-artifacts',
      'actor-test/teacher.pdf','ready','fef00000-0000-4000-8000-000000000002'
    )$$,
  'Report-card document generator is not authorized for school',
  'trusted worker cannot attribute a report artifact to an ordinary teacher'
);

select throws_ok(
  $$insert into public.report_card_documents(
      tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
      storage_bucket,storage_path,status
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fef10000-0000-4000-8000-000000000001','DOCUMENT_ACTOR_TEST','1','pdf','report-card-artifacts',
      'actor-test/missing.pdf','ready'
    )$$,
  'Report-card document generator is required',
  'trusted worker cannot persist an unattributed report artifact'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fef00000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$insert into public.report_card_documents(
      tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
      storage_bucket,storage_path,status,generated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fef10000-0000-4000-8000-000000000001','DOCUMENT_ACTOR_TEST','1','pdf','report-card-artifacts',
      'actor-test/spoof.pdf','ready','fef00000-0000-4000-8000-000000000002'
    )$$,
  'Report-card document generator must match authenticated actor',
  'authenticated manager cannot spoof another generator'
);

select throws_ok(
  $$update public.report_card_documents
    set generated_by_user_id='fef00000-0000-4000-8000-000000000002'
    where id='fef20000-0000-4000-8000-000000000001'$$,
  'Report-card document generation provenance is immutable',
  'stored report artifact generator cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_report_card_document_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_document_actor_integrity()','EXECUTE'),
  'report document actor-integrity trigger helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid='public.report_card_documents'::regclass
     and tgname='zz_report_card_document_actor_integrity_trg'
     and not tgisinternal),
  1,
  'report-card document metadata has one physical generator provenance guard'
);

select * from finish();
rollback;
