begin;

select plan(34);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('b1200000-0000-4000-8000-000000000001','n12-manager@example.test','authenticated','authenticated',now(),now()),
  ('b1200000-0000-4000-8000-000000000002','n12-teacher@example.test','authenticated','authenticated',now(),now()),
  ('b1200000-0000-4000-8000-000000000003','n12-platform@example.test','authenticated','authenticated',now(),now()),
  ('b1200000-0000-4000-8000-000000000004','n12-network@example.test','authenticated','authenticated',now(),now()),
  ('b1200000-0000-4000-8000-000000000005','n12-cross-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status)
values('b1210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N12 other school','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b1200000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b1200000-0000-4000-8000-000000000002','teacher','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','b1210000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000005','exam_officer','2026-01-01');

insert into public.platform_memberships(user_id,role_key,active_from)
values('b1200000-0000-4000-8000-000000000003','platform_admin','2026-01-01');

insert into public.education_authorities(id,name)
values('b1220000-0000-4000-8000-000000000001','N12 authority');
insert into public.education_regions(id,name)
values('b1230000-0000-4000-8000-000000000001','N12 region');
insert into public.education_circuits(id,name)
values('b1240000-0000-4000-8000-000000000001','N12 circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('b1250000-0000-4000-8000-000000000001','b1230000-0000-4000-8000-000000000001','b1220000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('b1260000-0000-4000-8000-000000000001','b1240000-0000-4000-8000-000000000001','b1230000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('b1270000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','b1220000-0000-4000-8000-000000000001','b1230000-0000-4000-8000-000000000001','b1240000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('b1280000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000004','circuit_officer','b1240000-0000-4000-8000-000000000001','2026-01-01');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('b1290000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','N12-SUB','N12 Subject','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('b12a0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'b1290000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name) values
  ('b12b0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'N12-BLOCKED','N12 blocked cycle'),
  ('b12b0000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'N12-CLEAN','N12 clean cycle');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000001',true);

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,candidate_number,centre_number,
  identity_verified,created_by_user_id
) values
  ('b12c0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b12b0000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',null,null,false,'b1200000-0000-4000-8000-000000000001'),
  ('b12c0000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b12b0000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','N12-CAND-001','LEGACY-CENTRE-01',true,'b1200000-0000-4000-8000-000000000001');

insert into public.examination_subject_registrations(
  id,tenant_id,school_id,candidate_id,subject_code,subject_name,subject_offering_id,registration_status
) values
  ('b12d0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b12c0000-0000-4000-8000-000000000001','N12-SUB','N12 Subject','b12a0000-0000-4000-8000-000000000001','ready'),
  ('b12d0000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','b12c0000-0000-4000-8000-000000000002','N12-SUB','N12 Subject','b12a0000-0000-4000-8000-000000000001','ready');

set local role authenticated;

select throws_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000001')$$,
  'Examination cycle has unresolved blocking readiness issues',
  'unresolved readiness blocker prevents frozen submission'
);

select lives_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  'clean cycle can create the first frozen registration version'
);

select is(
  (select candidate_number from public.examination_registration_submission_candidates
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1)),
  'N12-CAND-001'::text,
  'frozen candidate snapshot captures authoritative candidate number'
);

select is(
  (select subject_name from public.examination_registration_submission_subjects
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1)),
  'N12 Subject'::text,
  'frozen subject snapshot captures submitted registration value'
);

select lives_ok(
  $$select public.transition_examination_registration_submission(
      (select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1),
      'submitted','EXT-N12-001','External result authority receipt','RECEIPT-SOURCE-1',null)$$,
  'prepared frozen version can transition to submitted through governed RPC'
);

select is(
  (select external_reference_source_name from public.examination_registration_submission_events
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1)
     and event_type='submitted'),
  'External result authority receipt'::text,
  'external submission reference remains explicitly source-provenanced'
);

reset role;

select throws_ok(
  $$update public.examination_registration_submissions set version_number=9
    where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1$$,
  'N12 historical records are immutable; append a correction or lifecycle event',
  'frozen registration version cannot be rewritten even by a trusted direct write'
);

update public.examination_candidates
set candidate_number='N12-CAND-001-EDIT', centre_number='LEGACY-CENTRE-EDIT'
where id='b12c0000-0000-4000-8000-000000000002';
update public.examination_subject_registrations
set subject_name='N12 Subject Edited'
where id='b12d0000-0000-4000-8000-000000000002';

select is(
  (select candidate_number from public.examination_registration_submission_candidates
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1)),
  'N12-CAND-001'::text,
  'later canonical candidate edit does not rewrite frozen version'
);

select is(
  (select subject_name from public.examination_registration_submission_subjects
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1)),
  'N12 Subject'::text,
  'later canonical subject-registration edit does not rewrite frozen version'
);

set local role authenticated;
select lives_ok(
  $$select public.correct_examination_registration_submission(
      (select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1))$$,
  'correction creates a new immutable frozen version'
);

select ok(
  (select version_number=2 and corrects_submission_id is not null
   from public.examination_registration_submissions
   where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=2),
  'new correction version preserves explicit predecessor provenance'
);

select is(
  (select candidate_number from public.examination_registration_submission_candidates
   where submission_id=(select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=2)),
  'N12-CAND-001-EDIT'::text,
  'new correction version captures current canonical values without mutating version one'
);

select throws_ok(
  $$select public.correct_examination_registration_submission(
      (select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=1))$$,
  'Only a submitted registration version can be corrected',
  'duplicate correction transition from an already corrected version is rejected'
);

select lives_ok(
  $$select public.transition_examination_registration_submission(
      (select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=2),
      'submitted',null,null,null,null)$$,
  'corrected prepared version can be submitted'
);

select throws_ok(
  $$select public.transition_examination_registration_submission(
      (select id from public.examination_registration_submissions where examination_cycle_id='b12b0000-0000-4000-8000-000000000002' and version_number=2),
      'submitted',null,null,null,null)$$,
  'Only a prepared registration version can be submitted',
  'duplicate submit transition is rejected'
);
reset role;

select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'ordinary school staff cannot perform N12 individual submission operations'
);
reset role;

select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'platform administrator membership alone cannot perform N12 individual operations'
);
select is((select count(*)::integer from public.examination_registration_submissions),0,'platform administrator alone cannot enumerate frozen candidate submission versions');
reset role;

select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'network membership alone cannot perform individual N12 submission operations'
);
reset role;

select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'other-school examination manager cannot cross school boundary'
);
reset role;

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_like(
  $$select public.freeze_examination_registration_submission('b12b0000-0000-4000-8000-000000000002')$$,
  '%permission denied%',
  'anonymous caller cannot execute N12 individual submission RPC'
);
reset role;

select set_config('request.jwt.claim.sub','b1200000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_examination_result_import_batch(
      'b12b0000-0000-4000-8000-000000000002','External examination result file','N12-RESULT-FILE-1',now(),'sha256:test')$$,
  'school examination manager can create source-provenanced result import batch'
);

select is(
  (select source_name from public.examination_result_import_batches where examination_cycle_id='b12b0000-0000-4000-8000-000000000002'),
  'External examination result file'::text,
  'result import batch preserves source provenance'
);

select lives_ok(
  $$select public.stage_examination_result_import(
      (select id from public.examination_result_import_batches where examination_cycle_id='b12b0000-0000-4000-8000-000000000002'),
      'b12c0000-0000-4000-8000-000000000002','b12d0000-0000-4000-8000-000000000002',2,78,null,'B',
      'EXTERNAL-EXAM','v1',null,null,'ROW-1',null)$$,
  'valid source-provenanced external result row can enter non-authoritative staging'
);

select lives_ok(
  $$select public.stage_examination_result_import(
      (select id from public.examination_result_import_batches where examination_cycle_id='b12b0000-0000-4000-8000-000000000002'),
      'b12c0000-0000-4000-8000-000000000002','b12d0000-0000-4000-8000-000000000002',2,81,null,'A',
      'EXTERNAL-EXAM','v1',null,null,'ROW-1-CORRECTED',
      (select id from public.examination_result_import_staging where source_row_reference='ROW-1'))$$,
  'result correction appends a new source-provenanced staging row'
);

select ok(
  (select corrects_staging_id is not null from public.examination_result_import_staging where source_row_reference='ROW-1-CORRECTED')
  and (select result_value=78 from public.examination_result_import_staging where source_row_reference='ROW-1'),
  'staging correction preserves the prior source row and explicit correction lineage'
);

select throws_ok(
  $$select public.stage_examination_result_import(
      (select id from public.examination_result_import_batches where examination_cycle_id='b12b0000-0000-4000-8000-000000000002'),
      'b12c0000-0000-4000-8000-000000000001','b12d0000-0000-4000-8000-000000000001',2,70,null,'B',
      'EXTERNAL-EXAM','v1',null,null,'BAD-CYCLE',null)$$,
  'Result import scope mismatch: candidate does not match batch tenant, school, and cycle',
  'candidate/cycle mismatch is rejected before staging'
);

select throws_ok(
  $$select public.stage_examination_result_import(
      (select id from public.examination_result_import_batches where examination_cycle_id='b12b0000-0000-4000-8000-000000000002'),
      'b12c0000-0000-4000-8000-000000000002','b12d0000-0000-4000-8000-000000000001',2,70,null,'B',
      'EXTERNAL-EXAM','v1',null,null,'BAD-SUBJECT',null)$$,
  'Result import scope mismatch: subject registration does not match candidate and school',
  'candidate/subject-registration mismatch is rejected before staging'
);

select lives_ok(
  $$select public.promote_examination_result_import(
      (select id from public.examination_result_import_staging where source_row_reference='ROW-1-CORRECTED'))$$,
  'validated current staging row promotes into canonical official_results workflow'
);

select ok(
  exists(
    select 1
    from public.official_results r
    join public.examination_result_import_promotions p on p.official_result_id=r.id
    join public.examination_result_import_staging s on s.id=p.staging_id
    where s.source_row_reference='ROW-1-CORRECTED'
      and r.result_value=81
      and r.calculation_snapshot->>'source_type'='external_examination_result_import'
      and r.calculation_snapshot->>'staging_id'=s.id::text
  ),
  'canonical official result retains immutable external import provenance and correction source'
);

reset role;

select is(
  (select count(*)::integer from information_schema.tables
   where table_schema='public' and table_name in ('official_results','examination_official_results','official_examination_results')),
  1,
  'N12 creates no duplicate authoritative official-result table'
);

select ok(
  exists(select 1 from public.audit_events where event_type='examination_registration.submission.frozen' and entity_type='examination_registration_submission'),
  'frozen registration creation emits canonical audit event'
);

select ok(
  exists(select 1 from public.audit_events where event_type='examination_registration.submission.corrected' and entity_type='examination_registration_submission'),
  'registration correction emits canonical audit event'
);

select ok(
  exists(select 1 from public.audit_events where event_type='examination_results.import_batch.created')
  and exists(select 1 from public.audit_events where event_type='examination_results.import_row.staged')
  and exists(select 1 from public.audit_events where event_type='examination_results.import_row.corrected')
  and exists(select 1 from public.audit_events where event_type='examination_results.import_row.promoted'),
  'result import staging, correction and promotion emit canonical audit events'
);

select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema='public'
     and table_name in ('examination_registration_submission_candidates','examination_registration_submission_subjects')
     and (column_name ilike '%sen%' or column_name ilike '%support%' or column_name ilike '%counsel%' or column_name ilike '%arrangement%')),
  0,
  'frozen registration snapshot does not copy N10/SEN/support/counselling detail'
);

select ok(
  not has_table_privilege('authenticated','public.examination_registration_submissions','INSERT')
  and not has_table_privilege('authenticated','public.examination_registration_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.examination_result_import_staging','INSERT')
  and not has_table_privilege('authenticated','public.examination_result_import_staging','UPDATE')
  and not has_table_privilege('authenticated','public.official_results','INSERT'),
  'authenticated clients cannot bypass governed N12 or canonical official-result write RPC boundaries'
);

select * from finish();
rollback;
