begin;

select plan(25);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa7b0000-0000-4000-8000-000000000001','subject-sync-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa7b0000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fa7b1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SYNC-A','Sync Subject A','active'),
  ('fa7b1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SYNC-B','Sync Subject B','active'),
  ('fa7b1000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SYNC-11','Wrong Grade Sync Subject','active'),
  ('fa7b1000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SYNC-X','Inactive Sync Subject','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fa7b2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa7b1000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa7b2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa7b1000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa7b2000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa7b1000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000011',5,'active'),
  ('fa7b2000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa7b1000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000010',5,'inactive');

select ok(
  to_regprocedure('public.sync_learner_subject_registrations(uuid,uuid[],text,text)') is not null,
  'bulk subject-selection synchronization RPC exists'
);
select ok(
  not has_function_privilege('anon','public.sync_learner_subject_registrations(uuid,uuid[],text,text)','EXECUTE'),
  'anonymous users cannot synchronize learner subject choices'
);
select ok(
  has_function_privilege('authenticated','public.sync_learner_subject_registrations(uuid,uuid[],text,text)','EXECUTE'),
  'authenticated users can call the self-authorizing synchronization RPC'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa7b0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table first_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  array[
    'fa7b2000-0000-4000-8000-000000000001'::uuid,
    'fa7b2000-0000-4000-8000-000000000002'::uuid,
    'fa7b2000-0000-4000-8000-000000000001'::uuid
  ],
  'qa-bulk',
  'Selection synchronized in QA'
) data;

select is((select (data->>'selected_count')::integer from first_sync),2,'duplicate offering IDs are normalized to two selected subjects');
select is((select (data->>'registered_count')::integer from first_sync),2,'first synchronization registers both selected subjects');
select is(
  (select count(*)::integer from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and status='active'),
  2,
  'two active subject registrations persist after first synchronization'
);
select is(
  (select count(*)::integer from public.audit_events where entity_type='learner_subject_registration' and event_type='learner_subject_registration.registered' and metadata->>'enrolment_id'='60000000-0000-4000-8000-000000000001'),
  2,
  'first synchronization preserves per-registration audit evidence'
);
select is(
  (select count(*)::integer from public.audit_events where entity_type='enrolment' and entity_id='60000000-0000-4000-8000-000000000001' and event_type='learner_subject_registration.selection_synced'),
  1,
  'first meaningful synchronization emits one selection-summary audit event'
);

create temporary table repeat_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  array['fa7b2000-0000-4000-8000-000000000002'::uuid,'fa7b2000-0000-4000-8000-000000000001'::uuid],
  'qa-bulk',
  'Selection synchronized in QA'
) data;
select is((select (data->>'changed_count')::integer from repeat_sync),0,'repeating the same complete selection is idempotent');
select is((select (data->>'unchanged_count')::integer from repeat_sync),2,'repeat synchronization reports both choices unchanged');
select is(
  (select count(*)::integer from public.audit_events where entity_type='enrolment' and entity_id='60000000-0000-4000-8000-000000000001' and event_type='learner_subject_registration.selection_synced'),
  1,
  'idempotent retry does not duplicate summary audit evidence'
);

create temporary table reduced_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  array['fa7b2000-0000-4000-8000-000000000002'::uuid],
  'qa-bulk',
  'Learner changed one subject'
) data;
select is((select (data->>'withdrawn_count')::integer from reduced_sync),1,'removing one subject withdraws exactly one historical choice');
select is((select (data->>'active_count')::integer from reduced_sync),1,'reduced selection leaves one active subject');
select is(
  (select status from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and subject_offering_id='fa7b2000-0000-4000-8000-000000000001'),
  'withdrawn',
  'removed subject remains as withdrawn history instead of being deleted'
);

create temporary table restored_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  array['fa7b2000-0000-4000-8000-000000000001'::uuid,'fa7b2000-0000-4000-8000-000000000002'::uuid],
  'qa-bulk',
  'Selection restored'
) data;
select is((select (data->>'reactivated_count')::integer from restored_sync),1,'restoring a withdrawn choice reactivates the existing registration identity');
select is((select (data->>'active_count')::integer from restored_sync),2,'restored selection has two active subjects again');

select throws_ok(
  $$select public.sync_learner_subject_registrations('60000000-0000-4000-8000-000000000001',null,'qa-bulk','No accidental clear')$$,
  'Subject offering selection is required; use an empty array to clear all choices',
  'null selection is rejected so an omitted payload cannot accidentally clear every subject'
);
select throws_ok(
  $$select public.sync_learner_subject_registrations(
    '60000000-0000-4000-8000-000000000001',
    array['fa7b2000-0000-4000-8000-000000000001'::uuid,'fa7b2000-0000-4000-8000-000000000003'::uuid],
    'qa-bulk','Invalid grade should be atomic'
  )$$,
  'Selected subject offering grade does not match enrolment grade',
  'wrong-grade offering rejects the complete synchronization before any mutation'
);
select is(
  (select count(*)::integer from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and status='active'),
  2,
  'wrong-grade rejection preserves the previously valid two-subject selection'
);
select throws_ok(
  $$select public.sync_learner_subject_registrations(
    '60000000-0000-4000-8000-000000000001',
    array['fa7b2000-0000-4000-8000-000000000004'::uuid],
    'qa-bulk','Inactive offering should be atomic'
  )$$,
  'Selected subject offering is not active',
  'inactive offering rejects the synchronization'
);
select is(
  (select count(*)::integer from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and status='active'),
  2,
  'inactive-offering rejection also leaves the valid selection untouched'
);

create temporary table clear_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  '{}'::uuid[],
  'qa-bulk',
  'Deliberately cleared subject choices'
) data;
select is((select (data->>'withdrawn_count')::integer from clear_sync),2,'explicit empty array deliberately withdraws all active subject choices');
select is((select (data->>'active_count')::integer from clear_sync),0,'explicit clear leaves no active choices');

create temporary table repeat_clear_sync on commit drop as
select public.sync_learner_subject_registrations(
  '60000000-0000-4000-8000-000000000001',
  '{}'::uuid[],
  'qa-bulk',
  'Deliberately cleared subject choices'
) data;
select is((select (data->>'changed_count')::integer from repeat_clear_sync),0,'repeating an explicit clear is idempotent');
select is(
  (select count(*)::integer from public.audit_events where entity_type='enrolment' and entity_id='60000000-0000-4000-8000-000000000001' and event_type='learner_subject_registration.selection_synced'),
  4,
  'only the four meaningful selection changes emit summary audit evidence'
);

reset role;
select * from finish();
rollback;
