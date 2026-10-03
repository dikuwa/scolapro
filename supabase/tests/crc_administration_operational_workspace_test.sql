begin;

select plan(12);

select has_function('public','list_crc_administration_learners',array['uuid'],'CRC learner readiness read model exists');
select has_function('public','list_crc_transfer_register',array['uuid'],'CRC derived transfer register exists');
select has_function('public','list_crc_administration_documents',array['uuid'],'CRC document metadata register exists');

select is(
  has_function_privilege('anon','public.list_crc_administration_learners(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot read CRC learner readiness'
);
select is(
  has_function_privilege('anon','public.list_crc_transfer_register(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot read the CRC transfer register'
);
select is(
  has_function_privilege('anon','public.list_crc_administration_documents(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot read CRC document metadata'
);

select is(
  has_function_privilege('authenticated','public.list_crc_administration_learners(uuid)','EXECUTE'),
  true,
  'authenticated users may invoke guarded CRC learner readiness'
);
select is(
  has_function_privilege('authenticated','public.list_crc_transfer_register(uuid)','EXECUTE'),
  true,
  'authenticated users may invoke the guarded CRC transfer register'
);
select is(
  has_function_privilege('authenticated','public.list_crc_administration_documents(uuid)','EXECUTE'),
  true,
  'authenticated users may invoke guarded CRC document metadata'
);

select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_crc_administration_learners'),
  'CRC learner readiness is SECURITY DEFINER with explicit in-function authorization'
);
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_crc_transfer_register'),
  'CRC transfer register is SECURITY DEFINER with explicit in-function authorization'
);
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_crc_administration_documents'),
  'CRC document metadata read model is SECURITY DEFINER with explicit in-function authorization'
);

select * from finish();
rollback;
