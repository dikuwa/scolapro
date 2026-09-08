begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ac100000-0000-4000-8000-000000000001','n10-exam@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000002','n10-network@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000003','n10-cross-school@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000004','n10-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status)
values(
  'ac200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'N10 other school',
  'active'
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000001','exam_officer','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000003','exam_officer','2026-01-01');

insert into public.education_authorities(id,name)
values('ac300000-0000-4000-8000-000000000001','N10 authority');
insert into public.education_regions(id,name)
values('ac310000-0000-4000-8000-000000000001','N10 region');
insert into public.education_circuits(id,name)
values('ac320000-0000-4000-8000-000000000001','N10 circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('ac330000-0000-4000-8000-000000000001','ac310000-0000-4000-8000-000000000001','ac300000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('ac340000-0000-4000-8000-000000000001','ac320000-0000-4000-8000-000000000001','ac310000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('ac350000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ac300000-0000-4000-8000-000000000001','ac310000-0000-4000-8000-000000000001','ac320000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('ac360000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002','circuit_officer','ac320000-0000-4000-8000-000000000001','2026-01-01');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values(
  'ac400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'N10-TEST',
  'N10 access arrangement test'
);

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
) values(
  'ac410000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ac400000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'ac100000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.examination_access_arrangements(
  id,tenant_id,school_id,examination_cycle_id,candidate_id,arrangement_value,external_code,
  source_name,source_reference,effective_from,effective_to,recorded_by_user_id
) values(
  'ac500000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ac400000-0000-4000-8000-000000000001',
  'ac410000-0000-4000-8000-000000000001',
  'Authority-provided access value A',
  null,
  'DNEA source document',
  'N10-TEST-REF',
  '2026-01-01',
  '2026-12-31',
  'ac100000-0000-4000-8000-000000000001'
);

insert into public.examination_access_arrangement_status_history(
  id,arrangement_id,tenant_id,school_id,examination_cycle_id,candidate_id,status_value,
  source_name,source_reference,effective_from,effective_to,recorded_by_user_id
) values
  (
    'ac510000-0000-4000-8000-000000000001','ac500000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001',
    'Authority status value A','DNEA source document','STATUS-A','2026-01-01','2026-06-30',
    'ac100000-0000-4000-8000-000000000001'
  ),
  (
    'ac510000-0000-4000-8000-000000000002','ac500000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001',
    'Authority status value B','DNEA source document','STATUS-B','2026-07-01','2026-12-31',
    'ac100000-0000-4000-8000-000000000001'
  );

select is(
  (select count(*)::integer from public.examination_access_arrangements where candidate_id='ac410000-0000-4000-8000-000000000001'),
  1,
  'school examination manager can read the candidate arrangement'
);

select is(
  (select external_code from public.examination_access_arrangements where id='ac500000-0000-4000-8000-000000000001'),
  null::text,
  'authoritative external arrangement code remains nullable and is not invented'
);

select is(
  (select status_value from public.get_candidate_examination_access_arrangements('ac410000-0000-4000-8000-000000000001','2026-03-01')),
  'Authority status value A'::text,
  'historical read resolves the earlier effective status'
);

select is(
  (select status_value from public.get_candidate_examination_access_arrangements('ac410000-0000-4000-8000-000000000001','2026-09-01')),
  'Authority status value B'::text,
  'historical read resolves the later effective status'
);

reset role;

select ok(
  exists(select 1 from public.audit_events where entity_id='ac500000-0000-4000-8000-000000000001' and event_type='examination_access.arrangement.recorded'),
  'arrangement insertion is recorded in canonical audit_events'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='examination_access_arrangement_status' and event_type='examination_access.status.recorded' and metadata->>'arrangement_id'='ac500000-0000-4000-8000-000000000001'),
  2,
  'status history insertions are recorded in canonical audit_events'
);

select ok(
  not exists(
    select 1 from public.audit_events
    where entity_id in ('ac500000-0000-4000-8000-000000000001','ac510000-0000-4000-8000-000000000001','ac510000-0000-4000-8000-000000000002')
      and (metadata ? 'arrangement_value' or metadata ? 'status_value')
  ),
  'audit metadata excludes sensitive arrangement and status values'
);

select throws_like(
  $$insert into public.examination_access_arrangements(
      id,tenant_id,school_id,examination_cycle_id,candidate_id,arrangement_value,source_name,effective_from,effective_to,recorded_by_user_id
    ) values(
      'ac500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001',' authority-provided access value a ',
      'DNEA source document','2026-03-01','2026-04-01','ac100000-0000-4000-8000-000000000001')$$,
  '%conflicting key value violates exclusion constraint%',
  'duplicate overlapping arrangement values are rejected case-insensitively'
);

select throws_like(
  $$insert into public.examination_access_arrangement_status_history(
      id,arrangement_id,tenant_id,school_id,examination_cycle_id,candidate_id,status_value,source_name,effective_from,effective_to,recorded_by_user_id
    ) values(
      'ac510000-0000-4000-8000-000000000003','ac500000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001','Overlap status',
      'DNEA source document','2026-06-15','2026-07-15','ac100000-0000-4000-8000-000000000001')$$,
  '%conflicting key value violates exclusion constraint%',
  'overlapping status history for one arrangement is rejected'
);

select throws_ok(
  $$insert into public.examination_access_arrangement_status_history(
      id,arrangement_id,tenant_id,school_id,examination_cycle_id,candidate_id,status_value,source_name,effective_from,effective_to,recorded_by_user_id
    ) values(
      'ac510000-0000-4000-8000-000000000004','ac500000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001','Outside status',
      'DNEA source document','2025-12-01','2025-12-31','ac100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Examination access status period must be contained within the arrangement effective period',
  'status history cannot escape the arrangement effective period'
);

select throws_ok(
  $$insert into public.examination_access_arrangements(
      id,tenant_id,school_id,examination_cycle_id,candidate_id,arrangement_value,source_name,effective_from,recorded_by_user_id
    ) values(
      'ac500000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',
      'ac400000-0000-4000-8000-000000000001','ac410000-0000-4000-8000-000000000001','Bad scope','DNEA source document','2026-01-01',
      'ac100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Examination access arrangement scope mismatch: candidate does not match tenant, school, and cycle',
  'cross-tenant candidate scope mismatch is rejected'
);

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'other-school examination manager cannot read arrangement rows');
select throws_ok(
  $$select * from public.get_candidate_examination_access_arrangements('ac410000-0000-4000-8000-000000000001','2026-09-01')$$,
  'Permission denied',
  'other-school examination manager cannot use the individual arrangement read model'
);
reset role;

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'circuit role cannot enumerate individual arrangement rows');
select throws_ok(
  $$select * from public.get_candidate_examination_access_arrangements('ac410000-0000-4000-8000-000000000001','2026-09-01')$$,
  'Permission denied',
  'network membership alone cannot use the individual arrangement read model'
);
select is((select count(*)::integer from public.examination_candidates where id='ac410000-0000-4000-8000-000000000001'),0,'N10 does not broaden candidate identity access for network roles');
reset role;

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from public.examination_access_arrangements),0,'unscoped authenticated user cannot read arrangement rows');
reset role;

select is(has_table_privilege('anon','public.examination_access_arrangements','SELECT'),false,'anonymous role has no arrangement table read privilege');

select is(
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name in ('examination_access_arrangements','examination_access_arrangement_status_history') and column_name in ('support_case_id','learner_support_case_id','diagnosis','case_note','counselling_note')),
  0,
  'N10 creates no learner-support, diagnosis, counselling, or case-note linkage fields'
);

select * from finish();
rollback;
