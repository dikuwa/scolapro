begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fce00000-0000-4000-8000-000000000001','import-lifecycle-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fce00000-0000-4000-8000-000000000001','school_admin',current_date-1);

select throws_ok(
  $$select public.mark_import_batch_ready('00000000-0000-0000-0000-000000000001')$$,
  'P0001','Authentication required',
  'ready transition requires authentication'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fce00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_import_batch('22222222-2222-4222-8222-222222222222','learners','lifecycle.csv',null)$$,
  'school import manager can create lifecycle fixture batch'
);

select set_config('qa.lifecycle_batch_id',(select id::text from public.import_batches where source_file_name='lifecycle.csv'),true);

select is(
  public.stage_import_rows(
    current_setting('qa.lifecycle_batch_id')::uuid,
    '[{"row_number":2,"normalized":{"first_names":"Forged","surname":"Outcome"},"resolution":"create","issues":[]}]'::jsonb
  ),
  1,
  'one row is staged'
);

select is(
  (select resolution from public.import_rows where batch_id=current_setting('qa.lifecycle_batch_id')::uuid and row_number=2),
  'review',
  'client-supplied create outcome is downgraded to review'
);

select is(
  public.stage_import_rows(
    current_setting('qa.lifecycle_batch_id')::uuid,
    '[{"row_number":3,"normalized":{"first_names":"Broken"},"resolution":"error","issues":[{"level":"error","field":"surname","message":"Surname is required."}]}]'::jsonb
  ),
  1,
  'structural parser error row is staged'
);

select is(
  (select resolution from public.import_rows where batch_id=current_setting('qa.lifecycle_batch_id')::uuid and row_number=3),
  'error',
  'client structural error is preserved for review'
);

select throws_ok(
  $$select public.mark_import_batch_ready(current_setting('qa.lifecycle_batch_id')::uuid)$$,
  'P0001','Resolve review/error rows before committing',
  'batch with unresolved rows cannot advance to ready'
);

select lives_ok(
  $$select public.resolve_import_row((select id from public.import_rows where batch_id=current_setting('qa.lifecycle_batch_id')::uuid and row_number=2),'skip',null,null,null)$$,
  'review row can be resolved while batch is editable'
);

select lives_ok(
  $$select public.resolve_import_row((select id from public.import_rows where batch_id=current_setting('qa.lifecycle_batch_id')::uuid and row_number=3),'skip',null,null,null)$$,
  'error row can be explicitly resolved while batch is editable'
);

select is(
  public.mark_import_batch_ready(current_setting('qa.lifecycle_batch_id')::uuid),
  true,
  'fully resolved non-empty review batch advances to ready'
);

select is(
  public.mark_import_batch_ready(current_setting('qa.lifecycle_batch_id')::uuid),
  true,
  'ready transition is idempotent for safe retries'
);

select throws_ok(
  $$select public.resolve_import_row((select id from public.import_rows where batch_id=current_setting('qa.lifecycle_batch_id')::uuid and row_number=2),'create',null,null,null)$$,
  'P0001','Import batch is not editable',
  'ready batch rows cannot be rewritten after review closes'
);

select throws_ok(
  $$select public.stage_import_rows(current_setting('qa.lifecycle_batch_id')::uuid,'[{"row_number":4,"normalized":{}}]'::jsonb)$$,
  'P0001','Import batch is not editable',
  'ready batch cannot accept additional staged rows'
);

reset role;

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id,committed_at)
values('fce10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','completed-history.csv','completed','fce00000-0000-4000-8000-000000000001',now());
insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values('fce20000-0000-4000-8000-000000000001','fce10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}','{}','skip','[]');

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id,cancelled_at)
values('fce10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','cancelled-history.csv','cancelled','fce00000-0000-4000-8000-000000000001',now());
insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values('fce20000-0000-4000-8000-000000000002','fce10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}','{}','skip','[]');

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fce10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','failed-history.csv','failed','fce00000-0000-4000-8000-000000000001');
insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values('fce20000-0000-4000-8000-000000000003','fce10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}','{}','skip','[]');

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fce10000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','academic_structure','empty-review.csv','review','fce00000-0000-4000-8000-000000000001');

set local role authenticated;

select throws_ok(
  $$select public.mark_import_batch_ready('fce10000-0000-4000-8000-000000000001')$$,
  'P0001','Only reviewed import batches can be marked ready',
  'completed import history cannot be reopened as ready'
);

select throws_ok(
  $$select public.mark_import_batch_ready('fce10000-0000-4000-8000-000000000002')$$,
  'P0001','Only reviewed import batches can be marked ready',
  'cancelled import history cannot be reopened as ready'
);

select throws_ok(
  $$select public.mark_import_batch_ready('fce10000-0000-4000-8000-000000000003')$$,
  'P0001','Only reviewed import batches can be marked ready',
  'failed import history cannot be reopened as ready'
);

select throws_ok(
  $$select public.mark_import_batch_ready('fce10000-0000-4000-8000-000000000004')$$,
  'P0001','Import batch must contain at least one staged row',
  'empty review batch cannot become commit-ready'
);

select throws_ok(
  $$select public.resolve_import_row('fce20000-0000-4000-8000-000000000001','create',null,null,null)$$,
  'P0001','Import batch is not editable',
  'completed import row history cannot be mutated through resolution RPC'
);

select is(
  (select resolution from public.import_rows where id='fce20000-0000-4000-8000-000000000001'),
  'skip',
  'completed import row history remains unchanged after rejected mutation'
);

select * from finish();
rollback;
