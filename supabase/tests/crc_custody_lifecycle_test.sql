begin;

select plan(22);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc200000-0000-4000-8000-000000000001','custody-origin-social@example.test','authenticated','authenticated',now(),now()),
('fc200000-0000-4000-8000-000000000002','custody-receiving-social@example.test','authenticated','authenticated',now(),now()),
('fc200000-0000-4000-8000-000000000003','custody-principal@example.test','authenticated','authenticated',now(),now()),
('fc200000-0000-4000-8000-000000000004','custody-origin-teacher@example.test','authenticated','authenticated',now(),now()),
('fc200000-0000-4000-8000-000000000005','custody-unrelated-social@example.test','authenticated','authenticated',now(),now()),
('fc200000-0000-4000-8000-000000000006','custody-receiving-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Receiving School','CUSTODY-RECV','Khomas','Windhoek'),
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','Unrelated School','CUSTODY-UNREL','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000001','social_worker',current_date),
('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','fc200000-0000-4000-8000-000000000002','social_worker',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000003','principal',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000004','teacher',current_date),
('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','fc200000-0000-4000-8000-000000000005','social_worker',current_date),
('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','fc200000-0000-4000-8000-000000000006','teacher',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select ok(
  exists(
    select 1 from storage.buckets
    where id='crc-confidential-documents'
      and public=false
      and file_size_limit=10485760
  ),
  'crc confidential documents use a private 10 MB bucket'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname in ('Custody documents update','Custody documents delete')
  ),
  0,
  'crc custody attachments have no authenticated update or delete policy'
);

select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temp table custody_flow as
  select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'fc200000-0000-4000-8000-000000000002',
    'Official CRC transfer in progress'
  );

select is(
  (select count(*)::integer from custody_flow),
  1,
  'authorized origin custodian can prepare a confidential CRC custody'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000004',true);
set local role authenticated;

select throws_ok(
  $$select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'fc200000-0000-4000-8000-000000000002')$$,
  'Permission denied: not an authorized custodian at the learner school',
  'teacher at the origin school cannot prepare CRC custody'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000005',true);
set local role authenticated;

select throws_ok(
  $$select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'fc200000-0000-4000-8000-000000000002')$$,
  'Permission denied: not an authorized custodian at the learner school',
  'social worker at an unrelated school cannot prepare custody for another school learner'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'fc200000-0000-4000-8000-000000000001')$$,
  'CRC custody must be dispatched to a different school',
  'custody cannot be prepared for the same school'
);

select throws_ok(
  $$select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'fc200000-0000-4000-8000-000000000006')$$,
  'Receiving user is not an authorized custodian at the receiving school',
  'custody requires an explicitly authorized receiving custodian, not any staff member'
);

select throws_ok(
  $$select public.dispatch_crc_custody((select custody_id from custody_flow))$$,
  'CRC custody must be dispatched from authorized',
  'dispatch before authorization is rejected by the lifecycle guard'
);

select throws_ok(
  $$select public.authorize_crc_custody((select custody_id from custody_flow))$$,
  'Permission denied: only school leadership may authorize CRC custody',
  'origin custodian cannot authorize their own dispatch'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok(
  $$select public.authorize_crc_custody((select custody_id from custody_flow))$$,
  'school leadership authorizes the CRC dispatch'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$select public.dispatch_crc_custody((select custody_id from custody_flow))$$,
  'Permission denied: only the originating custodian may dispatch CRC custody',
  'origin teacher cannot dispatch confidential custody'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.dispatch_crc_custody((select custody_id from custody_flow))$$,
  'authorized origin custodian dispatches the CRC'
);
select throws_ok(
  $$select public.receive_crc_custody((select custody_id from custody_flow))$$,
  'Permission denied: only the authorized receiving custodian may receive CRC custody',
  'origin custodian cannot receive their own outgoing dispatch'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok(
  $$select public.receive_crc_custody((select custody_id from custody_flow))$$,
  'Permission denied: only the authorized receiving custodian may receive CRC custody',
  'staff at the receiving school without the named custodian role cannot receive'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$select public.receive_crc_custody((select custody_id from custody_flow))$$,
  'authorized receiving custodian receives the CRC'
);
select lives_ok(
  $$select public.acknowledge_crc_custody((select custody_id from custody_flow))$$,
  'authorized receiving custodian acknowledges the CRC'
);
select lives_ok(
  $$select public.close_crc_custody((select custody_id from custody_flow))$$,
  'authorized receiving custodian closes the custody lifecycle'
);

reset role;
select throws_ok(
  $$update public.crc_custody_records
     set prepared_by_user_id='fc200000-0000-4000-8000-000000000004'
   where id=(select custody_id from custody_flow)$$,
  'CRC custody provenance is immutable',
  'custody preparer provenance cannot be rewritten by privileged paths'
);

select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.get_my_crc_custody_records()),
  1,
  'origin custodian sees their outgoing custody record'
);

reset role;
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.get_my_crc_custody_records()),
  0,
  'unrelated-school social worker sees no custody records'
);
select is(
  (select count(*)::integer from public.crc_custody_records),
  0,
  'unrelated-school social worker cannot read custody rows at all'
);

reset role;
select ok(
  not has_function_privilege('authenticated','app_private.enforce_crc_custody_lifecycle_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_crc_custody_lifecycle_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.can_access_crc_custody_record(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.can_manage_crc_custody_outgoing(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.can_manage_crc_custody_incoming(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.is_support_role_member(uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','app_private.can_read_crc_custody_record_for_rls(uuid)','EXECUTE')
  and has_function_privilege('authenticated','app_private.can_insert_crc_custody_document_for_rls(uuid)','EXECUTE'),
  'sensitive CRC helpers stay private while only narrow RLS wrappers are executable'
);

select * from finish();
rollback;