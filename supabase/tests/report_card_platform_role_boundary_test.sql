begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ec000000-0000-4000-8000-000000000001','report-platform-support@example.test','authenticated','authenticated',now(),now()),
  ('ec000000-0000-4000-8000-000000000002','report-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ec000000-0000-4000-8000-000000000001','platform_support',current_date),
  ('ec000000-0000-4000-8000-000000000002','platform_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'school',null)$$,
  'Permission denied',
  'platform support cannot read management-only report-card scope summaries'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'generate')$$,
  'Permission denied',
  'platform support cannot create report-card management batches'
);
select is(
  (select count(*)::integer from public.report_card_batches),
  0,
  'denied platform support attempts do not create a batch'
);
reset role;

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select ok(
  (select total_count from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'school',null)) > 0,
  'platform administrator can read the governed school report-card scope summary'
);
select lives_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'generate')$$,
  'platform administrator can create a governed report-card batch across schools'
);
reset role;

select is(
  (select count(*)::integer from public.report_card_batches where school_id='22222222-2222-4222-8222-222222222222' and operation='generate'),
  1,
  'authorized platform administrator creates exactly one report-card batch'
);

select * from finish();
rollback;
