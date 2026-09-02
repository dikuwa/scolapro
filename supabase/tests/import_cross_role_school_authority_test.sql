begin;

select plan(10);

-- One authenticated user deliberately holds different roles in two schools:
-- School Admin in the QA school (import-authorized) and HOD in the existing
-- control school (not import-authorized). Authority must never be borrowed
-- from the first membership when an RPC is scoped to the second school.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fda00000-0000-4000-8000-000000000001','import-cross-role@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fda10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Import Cross Role School','IMP-XROLE-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','fda10000-0000-4000-8000-000000000001','fda00000-0000-4000-8000-000000000001','school_admin',current_date-2),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda00000-0000-4000-8000-000000000001','hod',current_date-2);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fda00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_import_batch('fda10000-0000-4000-8000-000000000001','subject_registrations','cross-role-authorized.csv',null)$$,
  'School Admin membership authorizes imports only in its own school'
);
select set_config('qa.cross_role_authorized_batch',(select id::text from public.import_batches where source_file_name='cross-role-authorized.csv'),true);

select throws_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','cross-role-denied.csv',null)$$,
  'P0001','Permission denied',
  'HOD membership in target school cannot borrow School Admin authority from another school'
);

select is(
  (select count(*)::integer from public.import_batches where school_id='fda10000-0000-4000-8000-000000000001'),
  1,
  'RLS exposes the import batch in the school where the user is authorized'
);
select is(
  (select count(*)::integer from public.import_batches where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'RLS does not expose import batches in the school where the same user only holds HOD'
);

select is(
  public.stage_import_rows(current_setting('qa.cross_role_authorized_batch')::uuid,'[]'::jsonb),
  0,
  'authorized-school batch operations still work for the mixed-role user'
);

reset role;

-- Seed a target-school batch and row as the test owner so every callable import
-- mutation can be exercised against the denied school without first needing the
-- authenticated user to create that batch.
insert into public.import_batches(
  id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id
) values(
  'fda20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'subject_registrations','cross-role-seeded-denied.csv','ready',
  'fda00000-0000-4000-8000-000000000001'
);
insert into public.import_rows(
  id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues
) values(
  'fda30000-0000-4000-8000-000000000001',
  'fda20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,'{}'::jsonb,'{}'::jsonb,'skip','[]'::jsonb
);

set local role authenticated;

select throws_ok(
  $$select public.stage_import_rows('fda20000-0000-4000-8000-000000000001','[]'::jsonb)$$,
  'P0001','Permission denied',
  'stage_import_rows enforces the target batch school rather than any other School Admin membership'
);
select throws_ok(
  $$select public.resolve_import_row('fda30000-0000-4000-8000-000000000001','skip',null,null,null)$$,
  'P0001','Permission denied',
  'resolve_import_row enforces the row school for a mixed-role user'
);
select throws_ok(
  $$select public.mark_import_batch_ready('fda20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied',
  'mark_import_batch_ready cannot borrow import authority from another school'
);
select throws_ok(
  $$select public.reconcile_subject_registration_import_batch('fda20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied',
  'subject-registration reconciliation cannot borrow import authority from another school'
);
select throws_ok(
  $$select public.commit_subject_registration_import_batch('fda20000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied',
  'subject-registration commit cannot borrow import authority from another school'
);

reset role;
select * from finish();
rollback;
