begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd000000-0000-4000-8000-000000000001','detention-history-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,
  academic_year,triggered_on,original_due_on,rollover_count
) values
  ('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',3,'2026-03-06','completed',2026,'2026-03-02','2026-03-06',0),
  ('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',3,'2026-06-12','pending',2026,'2026-06-08','2026-06-12',0),
  ('fd100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',3,'2026-04-10','completed',2026,'2026-04-06','2026-04-10',0);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(distinct learner_id)::integer from public.list_detention_history_page('22222222-2222-4222-8222-222222222222',null,1,1)),
  1,
  'detention history page size is enforced by learner group'
);

select is(
  (select count(*)::integer from public.list_detention_history_page('22222222-2222-4222-8222-222222222222',null,1,1)),
  2,
  'all obligations for the first learner remain together on the same page'
);

select is(
  (select total_learner_count::integer from public.list_detention_history_page('22222222-2222-4222-8222-222222222222',null,1,1) limit 1),
  2,
  'learner-group page reports the complete matching learner total'
);

select isnt(
  (select learner_id from public.list_detention_history_page('22222222-2222-4222-8222-222222222222',null,1,1) limit 1),
  (select learner_id from public.list_detention_history_page('22222222-2222-4222-8222-222222222222',null,2,1) limit 1),
  'successive detention history pages contain different learner groups'
);

select is(
  (select count(distinct learner_id)::integer from public.list_detention_history_page('22222222-2222-4222-8222-222222222222','DEMO-002',1,25)),
  1,
  'detention history search executes before learner paging'
);

select is(
  (select learner_id from public.list_detention_history_page('22222222-2222-4222-8222-222222222222','DEMO-002',1,25) limit 1),
  '50000000-0000-4000-8000-000000000002'::uuid,
  'detention history search returns the matching learner group'
);

select throws_ok(
  $$select * from public.list_detention_history_page('ffffffff-ffff-4fff-8fff-ffffffffffff',null,1,25)$$,
  'Permission denied',
  'detention history paging rejects a school outside the caller scope'
);

select ok(
  not has_function_privilege('anon','public.list_detention_history_page(uuid,text,integer,integer)','EXECUTE'),
  'anonymous clients cannot execute detention history paging'
);

select * from finish();
rollback;