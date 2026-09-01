begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('a1000000-0000-4000-8000-000000000001','import-scope-admin@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values
  ('a1100000-0000-4000-8000-000000000001','Import Scope Tenant A','import-scope-a','active'),
  ('a1100000-0000-4000-8000-000000000002','Import Scope Tenant B','import-scope-b','active');

insert into public.schools(id,tenant_id,name,emis_number,status)
values
  ('a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','Import Scope School A','IMP-SCOPE-A','active'),
  ('a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','Import Scope School B','IMP-SCOPE-B','active');

select ok(
  exists(select 1 from pg_constraint where conrelid='public.import_batches'::regclass and conname='import_batches_school_tenant_fkey' and convalidated),
  'import batch school/tenant ownership constraint exists and is validated'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.import_rows'::regclass and conname='import_rows_batch_scope_fkey' and convalidated),
  'import row parent-scope constraint exists and is validated'
);

select throws_ok(
  $$insert into public.import_batches(tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
    values('a1100000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000001','staff','mismatch.csv','review','a1000000-0000-4000-8000-000000000001')$$,
  '23503',
  null,
  'import batch cannot pair a school with a different tenant'
);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values(
  'a1300000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  'a1200000-0000-4000-8000-000000000001',
  'staff','valid.csv','review','a1000000-0000-4000-8000-000000000001'
);

select ok(
  exists(select 1 from public.import_batches where id='a1300000-0000-4000-8000-000000000001'),
  'matching tenant/school import batch is accepted'
);

select throws_ok(
  $$insert into public.import_rows(batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
    values('a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000001',1,'{}','{}','review','[]')$$,
  '23503',
  null,
  'import row cannot claim a different tenant from its parent batch'
);

select throws_ok(
  $$insert into public.import_rows(batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
    values('a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000002',2,'{}','{}','review','[]')$$,
  '23503',
  null,
  'import row cannot claim a different school from its parent batch'
);

select lives_ok(
  $$insert into public.import_rows(batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
    values('a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001',3,'{}','{}','review','[]')$$,
  'matching import row scope is accepted'
);

select * from finish();
rollback;
