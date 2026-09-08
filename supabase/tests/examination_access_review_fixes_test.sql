begin;

select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ad100000-0000-4000-8000-000000000001','n10-review-exam@example.test','authenticated','authenticated',now(),now()),
  ('ad100000-0000-4000-8000-000000000002','n10-review-platform@example.test','authenticated','authenticated',now(),now()),
  ('ad100000-0000-4000-8000-000000000003','n10-review-network@example.test','authenticated','authenticated',now(),now()),
  ('ad100000-0000-4000-8000-000000000004','n10-review-cross@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('ad100000-0000-4000-8000-000000000002','platform_admin','2026-01-01');

insert into public.schools(id,tenant_id,name,status)
values(
  'ad200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'N10 review other school',
  'active'
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ad100000-0000-4000-8000-000000000001','exam_officer','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','ad200000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000004','exam_officer','2026-01-01');

insert into public.education_authorities(id,name)
values('ad300000-0000-4000-8000-000000000001','N10 review authority');
insert into public.education_regions(id,name)
values('ad310000-0000-4000-8000-000000000001','N10 review region');
insert into public.education_circuits(id,name)
values('ad320000-0000-4000-8000-000000000001','N10 review circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('ad330000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('ad340000-0000-4000-8000-000000000001','ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('ad350000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ad300000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000001','ad320000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('ad360000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000003','circuit_officer','ad320000-0000-4000-8000-000000000001','2026-01-01');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values(
  'ad400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'N10-REVIEW',
  'N10 review cycle'
);

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
) values(
  'ad410000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ad400000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'ad100000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.examination_access_arrangements(
  id,tenant_id,school_id,examination_cycle_id,candidate_id,arrangement_value,
  source_name,source_reference,effective_from,effective_to,recorded_by_user_id
) values(
  'ad500000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ad400000-0000-4000-8000-000000000001',
  'ad410000-0000-4000-8000-000000000001',
  'Authority-provided access value review',
  'DNEA source document',
  'N10-REVIEW-ARR',
  '2026-01-01',
  null,
  'ad100000-0000-4000-8000-000000000001'
);

insert into public.examination_access_arrangement_status_history(
  id,arrangement_id,tenant_id,school_id,examination_cycle_id,candidate_id,status_value,
  source_name,source_reference,effective_from,effective_to,recorded_by_user_id
) values(
  'ad510000-0000-4000-8000-000000000001',
  'ad500000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ad400000-0000-4000-8000-000000000001',
  'ad410000-0000-4000-8000-000000000001',
  'Authority status review A',
  'DNEA source document',
  'N10-REVIEW-STATUS-A',
  '2026-01-01',
  null,
  'ad100000-0000-4000-8000-000000000001'
);

select is(
  (select count(*)::integer from public.examination_access_arrangements where id='ad500000-0000-4000-8000-000000000001'),
  1,
  'authorized school examination officer can read N10 arrangement'
);

select lives_ok(
  $$select public.transition_examination_access_arrangement_status(
      'ad500000-0000-4000-8000-000000000001',
      'Authority status review B',
      'DNEA source document',
      'N10-REVIEW-STATUS-B',
      '2026-07-01'
    )$$,
  'authorized school examination officer can supersede an open status'
);

select is(
  (select effective_to from public.examination_access_arrangement_status_history where id='ad510000-0000-4000-8000-000000000001'),
  '2026-06-30'::date,
  'governed transition closes predecessor on the day before successor starts'
);

select is(
  (select status_value from public.get_candidate_examination_access_arrangements('ad410000-0000-4000-8000-000000000001','2026-06-30')),
  'Authority status review A'::text,
  'historical as-of before transition returns predecessor status'
);

select is(
  (select status_value from public.get_candidate_examination_access_arrangements('ad410000-0000-4000-8000-000000000001','2026-07-01')),
  'Authority status review B'::text,
  'historical as-of on successor date returns successor status'
);

select throws_like(
  $$update public.examination_access_arrangement_status_history
    set effective_to='2026-05-31'
    where id='ad510000-0000-4000-8000-000000000001'$$,
  '%permission denied for table examination_access_arrangement_status_history%',
  'authenticated callers cannot arbitrarily update status history'
);

reset role;

select ok(
  exists(
    select 1 from public.audit_events
    where event_type='examination_access.status.transitioned'
      and metadata->>'arrangement_id'='ad500000-0000-4000-8000-000000000001'
      and metadata->>'previous_status_id'='ad510000-0000-4000-8000-000000000001'
      and metadata->>'successor_effective_from'='2026-07-01'
  ),
  'governed status transition writes canonical audit event'
);

select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'platform admin without school exam membership cannot read N10 arrangements');
select throws_ok(
  $$select * from public.get_candidate_examination_access_arrangements('ad410000-0000-4000-8000-000000000001','2026-07-01')$$,
  'Permission denied',
  'platform admin alone cannot use N10 individual read model'
);
select throws_ok(
  $$select public.transition_examination_access_arrangement_status('ad500000-0000-4000-8000-000000000001','Platform attempt','DNEA source document',null,'2026-08-01')$$,
  'Permission denied',
  'platform admin alone cannot transition N10 status'
);
select throws_like(
  $$insert into public.examination_access_arrangements(
      tenant_id,school_id,examination_cycle_id,candidate_id,arrangement_value,source_name,effective_from,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'ad400000-0000-4000-8000-000000000001','ad410000-0000-4000-8000-000000000001',
      'Platform attempt arrangement','DNEA source document','2026-02-01','ad100000-0000-4000-8000-000000000002')$$,
  '%violates row-level security policy%',
  'platform admin alone cannot insert N10 arrangements'
);
reset role;

select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'network/circuit member cannot read N10 arrangements');
select throws_ok(
  $$select public.transition_examination_access_arrangement_status('ad500000-0000-4000-8000-000000000001','Network attempt','DNEA source document',null,'2026-08-01')$$,
  'Permission denied',
  'network/circuit member cannot transition N10 status'
);
reset role;

select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'cross-school exam officer cannot read N10 arrangements');
select throws_ok(
  $$select public.transition_examination_access_arrangement_status('ad500000-0000-4000-8000-000000000001','Cross-school attempt','DNEA source document',null,'2026-08-01')$$,
  'Permission denied',
  'cross-school exam officer cannot transition N10 status'
);
reset role;

select is(
  has_function_privilege('anon','public.transition_examination_access_arrangement_status(uuid,text,text,text,date)','EXECUTE'),
  false,
  'anonymous role cannot execute N10 status transition'
);
select is(
  has_table_privilege('anon','public.examination_access_arrangements','SELECT'),
  false,
  'anonymous role cannot read N10 arrangement table'
);
select is(
  has_function_privilege('anon','public.get_candidate_examination_access_arrangements(uuid,date)','EXECUTE'),
  false,
  'anonymous role cannot execute N10 individual read model'
);

select * from finish();
rollback;
