begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa510000-0000-4000-8000-000000000001','nhs-reconciliation-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa510000-0000-4000-8000-000000000001','school_admin',current_date-1);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa510000-0000-4000-8000-000000000001',true);
select set_config(
  'qa.recon_class_id',
  (select rc.id::text from public.register_classes rc
   where rc.school_id='22222222-2222-4222-8222-222222222222'
     and rc.academic_year=2026
   order by rc.class_code
   limit 1),
  true
);
select set_config(
  'qa.recon_grade_id',
  (select rc.grade_id::text from public.register_classes rc where rc.id=current_setting('qa.recon_class_id')::uuid),
  true
);
select set_config(
  'qa.recon_class_code',
  (select rc.class_code from public.register_classes rc where rc.id=current_setting('qa.recon_class_id')::uuid),
  true
);

select lives_ok(
  format(
    $$select public.create_learner_enrolment(
      '22222222-2222-4222-8222-222222222222',
      2026,
      %L::uuid,
      %L::uuid,
      'Existing Legal Names',
      'Reconcile',
      'Old Preferred',
      '2012-01-02',
      'female',
      'RECON-851-1',
      current_date-30
    )$$,
    current_setting('qa.recon_grade_id'),
    current_setting('qa.recon_class_id')
  ),
  'fixture learner is created through canonical registration'
);

select set_config(
  'qa.recon_learner_id',
  (select sli.learner_id::text from public.school_learner_identifiers sli
   where sli.school_id='22222222-2222-4222-8222-222222222222'
     and sli.admission_number='RECON-851-1'),
  true
);

insert into public.import_batches(
  id,tenant_id,school_id,import_type,source_file_name,source_file_sha256,status,created_by_user_id
) values(
  'fa511000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'learners',
  'nhs-learners.csv',
  'source-sha',
  'review',
  'fa510000-0000-4000-8000-000000000001'
);

insert into public.import_rows(
  id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues
) values
(
  'fa512000-0000-4000-8000-000000000001',
  'fa511000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,
  '{}',
  jsonb_build_object(
    'admission_number','RECON-851-1',
    'register_class_code',current_setting('qa.recon_class_code'),
    'surname','Reconcile',
    'preferred_name','New Preferred',
    'sex','female',
    'date_of_birth','2012-01-02'
  ),
  'review',
  '[]'
),
(
  'fa512000-0000-4000-8000-000000000002',
  'fa511000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  3,
  '{}',
  jsonb_build_object(
    'admission_number','RECON-851-MISSING',
    'register_class_code',current_setting('qa.recon_class_code'),
    'surname','Missing',
    'preferred_name','Missing',
    'sex','male',
    'date_of_birth','2012-03-04'
  ),
  'review',
  '[]'
);

select lives_ok(
  $$select public.reconcile_existing_learner_roster_batch('fa511000-0000-4000-8000-000000000001',2026)$$,
  'existing-roster dry-run reconciliation completes'
);

select is(
  (select matched_entity_id::text from public.import_rows where id='fa512000-0000-4000-8000-000000000001'),
  current_setting('qa.recon_learner_id'),
  'existing learner is matched by stable school admission number'
);

select is(
  (select resolution from public.import_rows where id='fa512000-0000-4000-8000-000000000001'),
  'link',
  'workbook preferred/display name does not trigger an automatic canonical learner update'
);

select is(
  (select resolution from public.import_rows where id='fa512000-0000-4000-8000-000000000002'),
  'review',
  'unmatched source learner remains review and is never auto-created'
);

select throws_ok(
  $$select public.mark_existing_learner_roster_batch_ready('fa511000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Resolve every unmatched/review/error learner row before marking the reconciliation ready',
  'ready transition is blocked while the unmatched learner remains unresolved'
);

select lives_ok(
  $$select public.resolve_import_row(
    'fa512000-0000-4000-8000-000000000002',
    'skip',
    null,
    null,
    null
  )$$,
  'operator can explicitly skip the unmatched learner after review'
);

select is(
  public.mark_existing_learner_roster_batch_ready('fa511000-0000-4000-8000-000000000001'),
  true,
  'resolved learner reconciliation can become ready'
);

insert into public.import_batches(
  id,tenant_id,school_id,import_type,source_file_name,source_file_sha256,status,created_by_user_id
) values(
  'fa513000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'guardians',
  'nhs-guardians.csv',
  'guardian-source-sha',
  'review',
  'fa510000-0000-4000-8000-000000000001'
);

insert into public.import_rows(
  id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues
) values(
  'fa514000-0000-4000-8000-000000000001',
  'fa513000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,
  '{}',
  '{"learner_admission_number":"RECON-851-1","identity_number":"","first_names":"Parent","surname":"Example","relationship_type":"parent","email":"parent851@example.test","mobile":"0810000851","whatsapp":"","home_phone":"","work_phone":"","physical_address":"851 Test Street","postal_address":"","work_address":"","is_legal_guardian":false,"is_emergency_contact":false,"is_pickup_authorized":false,"priority":1}',
  'review',
  '[]'
);

select lives_ok(
  $$select public.reconcile_guardian_import_batch('fa513000-0000-4000-8000-000000000001')$$,
  'canonical guardian reconciliation evaluates the guardian row'
);

select is(
  (select resolution from public.import_rows where id='fa514000-0000-4000-8000-000000000001'),
  'create',
  'new guardian with contact evidence is a deterministic create candidate'
);

select is(
  public.mark_import_batch_ready('fa513000-0000-4000-8000-000000000001'),
  true,
  'resolved guardian batch can become ready'
);

select lives_ok(
  $$select public.commit_parent_learner_reconciliation(
    'fa511000-0000-4000-8000-000000000001',
    'fa513000-0000-4000-8000-000000000001',
    'keep'
  )$$,
  'learner and guardian batches commit atomically with an explicit stale-relationship decision'
);

select is(
  (select first_names from public.learners where id=current_setting('qa.recon_learner_id')::uuid),
  'Existing Legal Names',
  'legal learner first names are preserved'
);

select is(
  (select preferred_name from public.learners where id=current_setting('qa.recon_learner_id')::uuid),
  'Old Preferred',
  'workbook preferred/display name does not overwrite the canonical learner preferred name'
);

select is(
  (select count(*)::integer
   from public.learner_guardians lg
   join public.guardian_profiles gp on gp.id=lg.guardian_id
   where lg.learner_id=current_setting('qa.recon_learner_id')::uuid
     and gp.first_names='Parent'
     and gp.surname='Example'
     and lg.effective_from<=current_date
     and (lg.effective_to is null or lg.effective_to>=current_date)),
  1,
  'guardian relationship is created once for the reconciled learner'
);

select lives_ok(
  $select public.commit_parent_learner_reconciliation(
    'fa511000-0000-4000-8000-000000000001',
    'fa513000-0000-4000-8000-000000000001',
    'keep'
  )$,
  'safe retry returns the previously committed reconciliation instead of writing again'
);

select is(
  (select count(*)::integer
   from public.learner_guardians lg
   join public.guardian_profiles gp on gp.id=lg.guardian_id
   where lg.learner_id=current_setting('qa.recon_learner_id')::uuid
     and gp.first_names='Parent'
     and gp.surname='Example'
     and lg.effective_from<=current_date
     and (lg.effective_to is null or lg.effective_to>=current_date)),
  1,
  'idempotent reconciliation retry does not duplicate guardian relationships'
);

select * from finish();
rollback;
