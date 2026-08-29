begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9200000-0000-4000-8000-000000000001','archive-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9200000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id,cancelled_at)
    values('f9210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','old-test.xlsx','cancelled','f9200000-0000-4000-8000-000000000001',now())$$,
  'terminal import history can exist before archiving'
);

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values('f9220000-0000-4000-8000-000000000001','f9210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{"source":"kept"}','{}','skip','[]');

select lives_ok(
  $$select public.archive_import_batch('f9210000-0000-4000-8000-000000000001')$$,
  'school admin can archive a terminal import batch'
);
select ok((select archived_at is not null from public.import_batches where id='f9210000-0000-4000-8000-000000000001'),'archive timestamp is recorded');
select is((select count(*)::integer from public.import_rows where batch_id='f9210000-0000-4000-8000-000000000001'),1,'archiving does not delete staged audit rows');
select is((select count(*)::integer from public.audit_events where entity_id='f9210000-0000-4000-8000-000000000001' and event_type='import_batch.archived'),1,'archive action is audited');
select lives_ok(
  $$select public.restore_import_batch_from_archive('f9210000-0000-4000-8000-000000000001')$$,
  'archived history can be restored when needed'
);

select * from finish();
rollback;
