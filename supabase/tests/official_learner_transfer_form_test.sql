begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fcf00000-0000-4000-8000-000000000001','trf-principal@example.test','authenticated','authenticated',now(),now()),
  ('fcf00000-0000-4000-8000-000000000002','trf-custodian@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values(
  'fcf10000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'fcf00000-0000-4000-8000-000000000002',
  'TRF-CRC-001','Transfer','Custodian','active'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fcf00000-0000-4000-8000-000000000001',
    null,'principal',current_date-30
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fcf00000-0000-4000-8000-000000000002',
    'fcf10000-0000-4000-8000-000000000002',
    'teacher',current_date-30
  );

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fcf10000-0000-4000-8000-000000000002',
  'teacher',current_date-30,
  'fcf00000-0000-4000-8000-000000000001'
);

insert into public.school_duty_assignments(
  tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fcf10000-0000-4000-8000-000000000002',
  'crc_custodian',current_date-20,
  'fcf00000-0000-4000-8000-000000000001'
);

insert into public.transfer_events(
  id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,
  requested_on,effective_on,reason,status,initiated_by_user_id
) values(
  'fcf20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '50000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  '60000000-0000-4000-8000-000000000001',
  'Receiving Secondary School',
  current_date,current_date+1,
  'Family relocation',
  'requested',
  'fcf00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.approve_learner_transfer(
    'fcf20000-0000-4000-8000-000000000001'::uuid,
    current_date+1,
    'Transfer form preparation approved'
  )$$,
  'source-school leadership approves the canonical transfer first'
);

reset role;
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.get_learner_transfer_form_source(
    'fcf20000-0000-4000-8000-000000000001'::uuid
  )->>'learnerName',
  (
    select concat_ws(' ',first_names,surname)
    from public.learners
    where id='50000000-0000-4000-8000-000000000001'
  ),
  'delegated CRC custodian resolves learner identity from the canonical learner record'
);

select is(
  (
    public.get_learner_transfer_form_source(
      'fcf20000-0000-4000-8000-000000000001'::uuid
    )->'suggestionProvenance'->>'healthAuthorized'
  )::boolean,
  false,
  'delegated CRC custody alone does not authorize health-source disclosure'
);

select is(
  public.get_learner_transfer_form_source(
    'fcf20000-0000-4000-8000-000000000001'::uuid
  )->'suggestionProvenance' ? 'psychometric',
  false,
  'transfer-form suggestion provenance exposes no psychometric source collection'
);

select lives_ok(
  $$select public.save_learner_transfer_form_draft(
    'fcf20000-0000-4000-8000-000000000001'::uuid,
    'Family relocation',
    'Latest report and transfer correspondence',
    'Routine school conduct verified.',
    null,
    'Routine educational information verified.',
    'Checked against learner, enrolment and CRC records.',
    'English'
  )$,
  'authorized CRC custodian can save the human-verification draft'
);

select throws_ok(
  $$select * from public.finalize_learner_transfer_form(
    'fcf20000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_object(
      'schoolName',
      (select name from public.schools where id='22222222-2222-4222-8222-222222222222')
    )
  )$$,
  null,
  'delegated custodian cannot replace source-school leadership finalization'
);

reset role;
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_learner_transfer_form_candidates()
   where transfer_event_id='fcf20000-0000-4000-8000-000000000001'),
  1,
  'leadership sees the approved transfer in the transfer-form work queue'
);

create temp table trf_v1 on commit drop as
select * from public.finalize_learner_transfer_form(
  'fcf20000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_object(
    'schoolName',
    (select name from public.schools where id='22222222-2222-4222-8222-222222222222'),
    'schoolEmisNumber',
    (select emis_number from public.schools where id='22222222-2222-4222-8222-222222222222'),
    'town',
    (select town from public.schools where id='22222222-2222-4222-8222-222222222222')
  )
);

select is((select revision from trf_v1),1,'first finalized transfer form is revision 1');

select like(
  (select scolapro_reference from trf_v1),
  'SP-TRF-%',
  'finalization registers shared official-document verification provenance'
);

select is(
  (
    select data_snapshot->'verifiedFields'->>'behaviour'
    from public.learner_transfer_form_snapshots
    where id=(select snapshot_id from trf_v1)
  ),
  'Routine school conduct verified.',
  'finalized snapshot freezes the human-verified behaviour summary'
);

select is(
  (
    select data_snapshot->'verifiedFields'->>'mediumOfInstruction'
    from public.learner_transfer_form_snapshots
    where id=(select snapshot_id from trf_v1)
  ),
  'English',
  'finalized snapshot freezes the prescribed medium-of-instruction field'
);

reset role;

select throws_ok(
  format(
    'update public.learner_transfer_form_snapshots set data_snapshot=%L::jsonb where id=%L::uuid',
    '{"tampered":true}',
    (select snapshot_id from trf_v1)
  ),
  'Finalized learner transfer form content is immutable',
  'finalized transfer-form content cannot be edited in place'
);

select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.save_learner_transfer_form_draft(
    'fcf20000-0000-4000-8000-000000000001'::uuid,
    'Family relocation',
    'Latest report and transfer correspondence',
    'Updated verified conduct wording.',
    null,
    'Routine educational information verified.',
    'Second verification completed before correction revision.',
    'English'
  )$,
  'leadership can save a corrected verified draft'
);

create temp table trf_v2 on commit drop as
select * from public.finalize_learner_transfer_form(
  'fcf20000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_object(
    'schoolName',
    (select name from public.schools where id='22222222-2222-4222-8222-222222222222')
  )
);

select is((select revision from trf_v2),2,'later correction finalizes as revision 2');

select is(
  (select status from public.learner_transfer_form_snapshots where id=(select snapshot_id from trf_v1)),
  'superseded',
  'prior finalized transfer form remains preserved as superseded'
);

select is(
  (select revision from public.resolve_official_document_verification((select verification_token from trf_v1))),
  1,
  'superseded transfer-form verification token still resolves its original revision'
);

select * from finish();
rollback;
