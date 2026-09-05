begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe500000-0000-4000-8000-000000000001','import-actor-manager@example.test','authenticated','authenticated',now(),now()),
('fe500000-0000-4000-8000-000000000002','import-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe500000-0000-4000-8000-000000000001','school_admin',current_date);

select is(
  app_private.user_can_manage_school_imports('fe500000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222'),
  false,
  'unrelated user fails import-management authority mirror'
);

select is(
  app_private.user_can_manage_school_imports('fe500000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222'),
  true,
  'school administrator satisfies import-management authority mirror'
);

select lives_ok(
  $$insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
    values('fe510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','actor-test.csv','staging','fe500000-0000-4000-8000-000000000001')$$,
  'authorized import manager can create canonical batch provenance'
);

select throws_ok(
  $$update public.import_batches set created_by_user_id='fe500000-0000-4000-8000-000000000002' where id='fe510000-0000-4000-8000-000000000001'$$,
  'Import batch creator provenance is immutable',
  'import batch creator cannot be rewritten'
);

select lives_ok(
  $$update public.import_batches set status='review',updated_at=now() where id='fe510000-0000-4000-8000-000000000001'$$,
  'ordinary governed import lifecycle fields remain mutable'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe500000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$insert into public.import_batches(tenant_id,school_id,import_type,source_file_name,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','forged.csv','fe500000-0000-4000-8000-000000000002')$$,
  'Import batch creator must match authenticated actor',
  'authenticated write cannot attribute a batch to another user'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_school_imports(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_school_imports(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_import_batch_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_import_batch_actor_commit_integrity()','EXECUTE'),
  'import actor helpers remain private from client roles'
);

select ok(
  (select count(*)=2
      and count(*) filter(where tgdeferrable and tginitdeferred)=1
   from pg_catalog.pg_trigger
   where tgrelid='public.import_batches'::regclass
     and tgname in ('import_batch_submit_actor_integrity_trg','import_batch_actor_commit_integrity_trg')
     and not tgisinternal),
  'immediate and deferred import actor triggers are installed once each'
);

select * from finish();
rollback;