begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb000000-0000-4000-8000-000000000001','remark-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000002','remark-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000003','remark-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Remark Review School','TST-REMARK-001','active'),
  ('fb100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other Remark School','TST-REMARK-002','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Reviewed','Remark');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status) values
  ('fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001',2026,'REMARK-001','2026-01-01','current');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values
  ('fb400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',2026,1,'SCOLAPRO_TERM_REPORT_V1',1001,'{}'::jsonb,'draft','fb000000-0000-4000-8000-000000000001',null,null),
  ('fb400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',2026,2,'SCOLAPRO_TERM_REPORT_V1',1002,'{}'::jsonb,'certified','fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',now()),
  ('fb400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',2026,3,'SCOLAPRO_TERM_REPORT_V1',1003,'{}'::jsonb,'published','fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',now());

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000001','  Strong improvement in practical work.  ')$$,
  'owning report manager can save a reviewed remark on a draft snapshot'
);
reset role;

select is(
  (select data_snapshot ->> 'remarks' from public.report_card_snapshots where id='fb400000-0000-4000-8000-000000000001'),
  'Strong improvement in practical work.',
  'saved remark is trimmed and frozen inside the snapshot payload'
);

select is(
  (select count(*)::integer from public.audit_events where event_type='report_card.remark.saved' and entity_id='fb400000-0000-4000-8000-000000000001'),
  1,
  'saving a reviewed remark creates one audit event'
);

select is(
  (select actor_user_id from public.audit_events where event_type='report_card.remark.saved' and entity_id='fb400000-0000-4000-8000-000000000001' limit 1),
  'fb000000-0000-4000-8000-000000000001'::uuid,
  'remark audit event preserves the authenticated actor'
);

select ok(
  not exists(
    select 1 from public.audit_events
    where event_type='report_card.remark.saved'
      and entity_id='fb400000-0000-4000-8000-000000000001'
      and metadata::text like '%Strong improvement%'
  ),
  'audit metadata does not duplicate the learner remark text'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000001','Teacher override')$$,
  'Permission denied',
  'teacher cannot directly rewrite a draft report-card remark'
);
reset role;

select is(
  (select data_snapshot ->> 'remarks' from public.report_card_snapshots where id='fb400000-0000-4000-8000-000000000001'),
  'Strong improvement in practical work.',
  'denied teacher write leaves the reviewed remark unchanged'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000001','Cross-school override')$$,
  'Permission denied',
  'administrator from another school cannot rewrite the remark'
);
reset role;

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000002','Too late')$$,
  'Only draft report-card remarks can be changed',
  'certified snapshot remark is immutable'
);
select throws_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000003','Too late')$$,
  'Only draft report-card remarks can be changed',
  'published snapshot remark is immutable'
);
select throws_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000001',repeat('x',1201))$$,
  'Report-card remark is too long',
  'oversized remark is rejected at the database boundary'
);
select lives_ok(
  $$select public.save_report_card_snapshot_remark('fb400000-0000-4000-8000-000000000001','')$$,
  'owning manager can clear the learner-specific draft remark to use the school fallback'
);
reset role;

select is(
  (select data_snapshot ->> 'remarks' from public.report_card_snapshots where id='fb400000-0000-4000-8000-000000000001'),
  '',
  'cleared draft remark is stored as blank so the renderer falls back to school default text'
);

select is(
  (select count(*)::integer from public.audit_events where event_type='report_card.remark.saved' and entity_id='fb400000-0000-4000-8000-000000000001'),
  2,
  'saving and clearing each produce an auditable review event'
);

select * from finish();
rollback;
