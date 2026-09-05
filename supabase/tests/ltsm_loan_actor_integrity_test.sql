begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd700000-0000-4000-8000-000000000001','ltsm-actor-manager@example.test','authenticated','authenticated',now(),now()),
  ('fd700000-0000-4000-8000-000000000002','ltsm-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd700000-0000-4000-8000-000000000001',
  'librarian',
  current_date
);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values(
  'fd710000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'library_book','LTSM Actor Integrity Book','active'
);

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability)
values
  ('fd720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd710000-0000-4000-8000-000000000001','LTSM-ACTOR-001','good','available'),
  ('fd720000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd710000-0000-4000-8000-000000000001','LTSM-ACTOR-002','good','available'),
  ('fd720000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd710000-0000-4000-8000-000000000001','LTSM-ACTOR-003','good','available');

select throws_ok(
  $$insert into public.learning_resource_loans(tenant_id,school_id,copy_id,learner_id,issued_on,issued_condition,status,issued_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd720000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date,'good','open','fd700000-0000-4000-8000-000000000002')$$,
  'Learning resource loan issuer is not authorized for school',
  'trusted write cannot forge an unrelated LTSM issuer'
);

select throws_ok(
  $$insert into public.learning_resource_loans(tenant_id,school_id,copy_id,learner_id,issued_on,issued_condition,status,issued_by_user_id,returned_on,returned_condition,returned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd720000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',current_date,'good','returned','fd700000-0000-4000-8000-000000000001',current_date,'good','fd700000-0000-4000-8000-000000000001')$$,
  'Learning resource loans must be created open without return provenance',
  'trusted write cannot manufacture a pre-returned loan'
);

select lives_ok(
  $$insert into public.learning_resource_loans(id,tenant_id,school_id,copy_id,learner_id,issued_on,issued_condition,status,issued_by_user_id)
    values('fd730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd720000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',current_date,'good','open','fd700000-0000-4000-8000-000000000001')$$,
  'authorized LTSM manager can create a canonical open loan'
);

select throws_ok(
  $$update public.learning_resource_loans set issued_by_user_id='fd700000-0000-4000-8000-000000000002' where id='fd730000-0000-4000-8000-000000000001'$$,
  'Learning resource loan issuer provenance is immutable',
  'issuer provenance cannot be rewritten'
);

select throws_ok(
  $$update public.learning_resource_loans set status='returned' where id='fd730000-0000-4000-8000-000000000001'$$,
  'Returned learning resource loan requires return provenance',
  'return transition requires actor, date and condition provenance'
);

select throws_ok(
  $$update public.learning_resource_loans set status='returned',returned_on=current_date,returned_condition='good',returned_by_user_id='fd700000-0000-4000-8000-000000000002' where id='fd730000-0000-4000-8000-000000000001'$$,
  'Learning resource loan returner is not authorized for school',
  'trusted write cannot forge an unrelated returner'
);

select lives_ok(
  $$update public.learning_resource_loans set status='overdue' where id='fd730000-0000-4000-8000-000000000001'$$,
  'open loan can become overdue without return provenance'
);

select lives_ok(
  $$update public.learning_resource_loans set status='returned',returned_on=current_date,returned_condition='good',returned_by_user_id='fd700000-0000-4000-8000-000000000001' where id='fd730000-0000-4000-8000-000000000001'$$,
  'authorized LTSM manager can return an overdue loan'
);

select throws_ok(
  $$update public.learning_resource_loans set returned_by_user_id='fd700000-0000-4000-8000-000000000002' where id='fd730000-0000-4000-8000-000000000001'$$,
  'Learning resource loan return provenance is immutable',
  'completed return actor cannot be rewritten'
);

select throws_ok(
  $$update public.learning_resource_loans set returned_condition='damaged' where id='fd730000-0000-4000-8000-000000000001'$$,
  'Learning resource loan return provenance is immutable',
  'completed return condition cannot be rewritten'
);

select ok(
  (select status='returned'
          and issued_by_user_id='fd700000-0000-4000-8000-000000000001'
          and returned_by_user_id='fd700000-0000-4000-8000-000000000001'
          and returned_condition='good'
     from public.learning_resource_loans
    where id='fd730000-0000-4000-8000-000000000001'),
  'authorized lifecycle preserves durable issue and return provenance'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_ltsm(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_ltsm(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learning_resource_loan_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learning_resource_loan_actor_integrity()','EXECUTE'),
  'LTSM arbitrary-user and actor trigger helpers remain private'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname='learning_resource_loan_actor_integrity_trg'
     and not tgisinternal),
  1,
  'LTSM loan actor integrity trigger is installed once'
);

select * from finish();
rollback;
