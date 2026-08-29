begin;

select plan(12);

-- Authenticated school-admin fixture. Tests run inside a transaction and roll back.
insert into auth.users (id, email, aud, role, created_at, updated_at)
values ('f1000000-0000-4000-8000-000000000001','guardian-import-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships (tenant_id,school_id,user_id,role_key,active_from)
values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f1000000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source,assigned_by_user_id)
values
  ('f2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','TST-GUARD-001','manual','f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','TST-GUARD-002','manual','f1000000-0000-4000-8000-000000000001');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values ('f3000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Existing','Guardian','G-ID-001');

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values ('f4000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','guardian-behavior.csv','review','f1000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values
  ('f5000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}',jsonb_build_object('learner_admission_number','TST-GUARD-001','identity_number','G-ID-001','first_names','Existing','surname','Guardian','relationship_type','guardian','priority',1),'review','[]'),
  ('f5000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',3,'{}',jsonb_build_object('learner_admission_number','TST-GUARD-002','identity_number','G-ID-001','first_names','Different','surname','Person','relationship_type','guardian','priority',1),'review','[]'),
  ('f5000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',4,'{}',jsonb_build_object('learner_admission_number','TST-GUARD-001','identity_number','G-ID-002','first_names','Existing','surname','Guardian','relationship_type','aunt','priority',2),'review','[]'),
  ('f5000000-0000-4000-8000-000000000004','f4000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',5,'{}',jsonb_build_object('learner_admission_number','NO-SUCH-LEARNER','identity_number','G-ID-003','first_names','Missing','surname','Learner','relationship_type','guardian','priority',1),'review','[]');

select public.reconcile_guardian_import_batch('f4000000-0000-4000-8000-000000000001');

select is((select resolution from public.import_rows where id='f5000000-0000-4000-8000-000000000001'),'link','exact guardian identity and matching name resolves to link');
select is((select resolution from public.import_rows where id='f5000000-0000-4000-8000-000000000002'),'review','exact identity with a different name requires review');
select is((select resolution from public.import_rows where id='f5000000-0000-4000-8000-000000000003'),'create','same name without matching identity remains a new guardian');
select is((select resolution from public.import_rows where id='f5000000-0000-4000-8000-000000000004'),'error','unknown learner admission number is blocked');

select throws_ok(
  $$select public.mark_import_batch_ready('f4000000-0000-4000-8000-000000000001')$$,
  'Resolve review/error rows before committing',
  'guardian batch cannot become ready while review/error rows remain'
);

select is(
  public.resolve_import_row('f5000000-0000-4000-8000-000000000002','link','guardian','f3000000-0000-4000-8000-000000000001',null),
  true,
  'school admin can explicitly confirm the matched existing guardian'
);
select is(
  public.resolve_import_row('f5000000-0000-4000-8000-000000000004','skip',null,null,null),
  true,
  'school admin can explicitly skip the invalid source row'
);
select is(public.mark_import_batch_ready('f4000000-0000-4000-8000-000000000001'),true,'fully resolved guardian batch can become ready');

select lives_ok(
  $$select public.commit_guardian_import_batch('f4000000-0000-4000-8000-000000000001')$$,
  'resolved guardian batch commits atomically'
);

select is(
  (select first_names || ' ' || surname from public.guardian_profiles where id='f3000000-0000-4000-8000-000000000001'),
  'Existing Guardian',
  'confirmed link does not overwrite existing guardian identity name with CSV mismatch text'
);
select ok(
  exists(select 1 from public.learner_guardians where learner_id='50000000-0000-4000-8000-000000000002' and guardian_id='f3000000-0000-4000-8000-000000000001' and effective_to is null),
  'confirmed existing guardian is linked to the intended learner'
);
select ok(
  exists(select 1 from public.guardian_profiles where tenant_id='11111111-1111-4111-8111-111111111111' and identity_number='G-ID-002'),
  'new stable guardian identity is created when identity number does not already exist'
);

select * from finish();
rollback;
