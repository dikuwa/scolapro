begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','late-summary-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-01','fc000000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-08-24','fc000000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-08-27','fc000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select count(*)::integer from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-24','2026-08-28')),
  2,
  'late-arrival roster returns the current school roster once per learner'
);

select is(
  (select total_late_count from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-24','2026-08-28') where learner_id='50000000-0000-4000-8000-000000000001'),
  3,
  'yearly late count is aggregated in PostgreSQL'
);

select is(
  (select cardinality(week_late_dates) from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-24','2026-08-28') where learner_id='50000000-0000-4000-8000-000000000001'),
  2,
  'current-week late dates are aggregated without returning full event history'
);

select is(
  (select last_late_date from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-24','2026-08-28') where learner_id='50000000-0000-4000-8000-000000000001'),
  '2026-08-27'::date,
  'latest late-arrival date is retained in the summary'
);

select is(
  (select total_late_count from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-24','2026-08-28') where learner_id='50000000-0000-4000-8000-000000000002'),
  0,
  'learners without late events receive zero-count summary rows'
);

select throws_ok(
  $$select * from public.list_late_arrival_roster_summary('ffffffff-ffff-4fff-8fff-ffffffffffff',2026,'2026-08-24','2026-08-28')$$,
  'Permission denied',
  'late-arrival summary rejects a school outside the caller scope'
);

select throws_ok(
  $$select * from public.list_late_arrival_roster_summary('22222222-2222-4222-8222-222222222222',2026,'2026-08-28','2026-08-24')$$,
  'Invalid week range',
  'late-arrival summary rejects an inverted week range'
);

select ok(
  not has_function_privilege('anon','public.list_late_arrival_roster_summary(uuid,integer,date,date)','EXECUTE'),
  'anonymous clients cannot execute the late-arrival roster summary'
);

select * from finish();
rollback;