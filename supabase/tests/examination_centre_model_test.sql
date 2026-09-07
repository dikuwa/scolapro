begin;

select plan(28);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('e9000000-0000-4000-8000-000000000001','n09-exam-a@example.test','authenticated','authenticated',now(),now()),
('e9000000-0000-4000-8000-000000000002','n09-exam-b@example.test','authenticated','authenticated',now(),now()),
('e9000000-0000-4000-8000-000000000003','n09-unauthorized@example.test','authenticated','authenticated',now(),now()),
('e9000000-0000-4000-8000-000000000004','n09-circuit@example.test','authenticated','authenticated',now(),now()),
('e9000000-0000-4000-8000-000000000005','n09-expired-network@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status) values
('e9100000-0000-4000-8000-000000000001','N09 tenant A','n09-tenant-a','active'),
('e9100000-0000-4000-8000-000000000002','N09 tenant B','n09-tenant-b','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
('e9200000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','N09 School A','N09-EMIS-A','Test Region','Town A','active'),
('e9200000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','N09 School B','N09-EMIS-B','Test Region','Town B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','exam_officer','2026-01-01'),
('e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000002','exam_officer','2026-01-01');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('e9300000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','N09','Learner A','female'),
('e9300000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','N09','Learner B','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('e9310000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9300000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
('e9310000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9300000-0000-4000-8000-000000000002',2026,'2026-01-01','current');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name,status) values
('e9400000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001',2026,'n09-cycle','N09 cycle A','open'),
('e9400000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002',2026,'n09-cycle','N09 cycle B','open');

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,registration_status,identity_verified,created_by_user_id
) values
('e9500000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001','e9300000-0000-4000-8000-000000000001','e9310000-0000-4000-8000-000000000001','ready',true,'e9000000-0000-4000-8000-000000000001'),
('e9500000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9400000-0000-4000-8000-000000000002','e9300000-0000-4000-8000-000000000002','e9310000-0000-4000-8000-000000000002','ready',true,'e9000000-0000-4000-8000-000000000002');

insert into public.education_authorities(id,name)
values('e9600000-0000-4000-8000-000000000001','N09 authority');
insert into public.education_regions(id,name)
values('e9610000-0000-4000-8000-000000000001','N09 region');
insert into public.education_circuits(id,name) values
('e9620000-0000-4000-8000-000000000001','N09 circuit A'),
('e9620000-0000-4000-8000-000000000002','N09 circuit B');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('e9630000-0000-4000-8000-000000000001','e9610000-0000-4000-8000-000000000001','e9600000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
('e9640000-0000-4000-8000-000000000001','e9620000-0000-4000-8000-000000000001','e9610000-0000-4000-8000-000000000001','2020-01-01'),
('e9640000-0000-4000-8000-000000000002','e9620000-0000-4000-8000-000000000002','e9610000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
('e9650000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9600000-0000-4000-8000-000000000001','e9610000-0000-4000-8000-000000000001','e9620000-0000-4000-8000-000000000001','2020-01-01'),
('e9650000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9600000-0000-4000-8000-000000000001','e9610000-0000-4000-8000-000000000001','e9620000-0000-4000-8000-000000000002','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from,active_to) values
('e9660000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000004','circuit_officer','e9620000-0000-4000-8000-000000000001','2026-01-01',null),
('e9660000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000005','circuit_officer','e9620000-0000-4000-8000-000000000001','2025-01-01','2025-12-31');

insert into public.examination_centres(id,display_name) values
('e9700000-0000-4000-8000-000000000001','N09 Historical Centre Fixture'),
('e9700000-0000-4000-8000-000000000002','N09 Shared Centre Fixture'),
('e9700000-0000-4000-8000-000000000003','N09 Unassigned Centre Fixture');

insert into public.examination_centre_status_history(
  id,examination_centre_id,status_value,source_name,source_reference,effective_from,effective_to
) values
('e9710000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','authority-status-a','test-authority-source','fixture-status-a','2026-01-01','2026-06-30'),
('e9710000-0000-4000-8000-000000000002','e9700000-0000-4000-8000-000000000002','authority-status-b','test-authority-source','fixture-status-b','2026-07-01',null);

insert into public.examination_centre_identifier_history(
  id,examination_centre_id,identifier_scheme,identifier_value,source_name,source_reference,effective_from,effective_to
) values
('e9720000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','dnea_centre','TEST-CENTRE-OLD','test-authority-source','fixture-id-old','2026-01-01','2026-06-30'),
('e9720000-0000-4000-8000-000000000002','e9700000-0000-4000-8000-000000000002','dnea_centre','TEST-CENTRE-CURRENT','test-authority-source','fixture-id-current','2026-07-01',null);

insert into public.school_examination_centre_assignments(
  id,tenant_id,school_id,examination_centre_id,effective_from,effective_to,source_name,source_reference
) values
('e9730000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000001','2025-01-01','2025-12-31','test-authority-source','fixture-old-assignment'),
('e9730000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','2026-01-01',null,'test-authority-source','fixture-current-a'),
('e9730000-0000-4000-8000-000000000003','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9700000-0000-4000-8000-000000000002','2026-01-01',null,'test-authority-source','fixture-current-b');

insert into public.examination_candidate_centre_assignments(
  id,tenant_id,school_id,examination_cycle_id,candidate_id,examination_centre_id,effective_from,source_name,source_reference
) values
('e9740000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001','e9500000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','2026-01-01','test-authority-source','fixture-candidate-a'),
('e9740000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9400000-0000-4000-8000-000000000002','e9500000-0000-4000-8000-000000000002','e9700000-0000-4000-8000-000000000002','2026-01-01','test-authority-source','fixture-candidate-b');

select is(
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='examination_centres' and column_name='school_id'),
  0,
  'examination-centre identity is not a school identity row'
);
select is(
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='examination_centres' and column_name in ('centre_number','emis_number')),
  0,
  'centre identity does not reuse EMIS or an invented centre-number field'
);
select is(
  (select count(distinct school_id)::integer from public.school_examination_centre_assignments where examination_centre_id='e9700000-0000-4000-8000-000000000002' and effective_to is null),
  2,
  'one examination centre can serve multiple schools across tenant boundaries'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select centre_name from public.list_examination_centres_scope('2025-06-01')),
  'N09 Historical Centre Fixture'::text,
  'school centre assignment is historically reproducible as-of an earlier date'
);
select is(
  (select status_value from public.list_examination_centres_scope('2026-04-01')),
  'authority-status-a'::text,
  'effective centre status resolves the earlier authoritative status value'
);
select is(
  (select status_value from public.list_examination_centres_scope('2026-08-01')),
  'authority-status-b'::text,
  'effective centre status resolves the later authoritative status value'
);
select is(
  (select identifier_value from public.examination_centre_identifier_history where examination_centre_id='e9700000-0000-4000-8000-000000000002' and effective_from <= '2026-04-01' and (effective_to is null or effective_to >= '2026-04-01')),
  'TEST-CENTRE-OLD'::text,
  'external centre identifier history preserves the earlier authoritative version'
);
select is(
  (select identifier_value from public.examination_centre_identifier_history where examination_centre_id='e9700000-0000-4000-8000-000000000002' and effective_from <= '2026-08-01' and (effective_to is null or effective_to >= '2026-08-01')),
  'TEST-CENTRE-CURRENT'::text,
  'external centre identifier history preserves the later authoritative version'
);

reset role;

select throws_ok(
  $$insert into public.school_examination_centre_assignments(tenant_id,school_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000002','e9700000-0000-4000-8000-000000000003','2027-01-01','test-authority-source')$$,
  'P0001',
  'School examination-centre scope mismatch: school does not belong to tenant',
  'invalid cross-tenant school-to-centre scope is rejected'
);
select throws_like(
  $$insert into public.school_examination_centre_assignments(tenant_id,school_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000003','2026-06-01','test-authority-source')$$,
  '%conflicting key value violates exclusion constraint%',
  'overlapping school centre assignments are rejected'
);
select throws_ok(
  $$insert into public.examination_candidate_centre_assignments(tenant_id,school_id,examination_cycle_id,candidate_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002','e9400000-0000-4000-8000-000000000002','e9500000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','2027-01-01','test-authority-source')$$,
  'P0001',
  'Candidate examination-centre scope mismatch: candidate does not match tenant, school, and cycle',
  'candidate centre assignment cannot cross candidate tenant/school/cycle scope'
);
select throws_ok(
  $$insert into public.examination_candidate_centre_assignments(tenant_id,school_id,examination_cycle_id,candidate_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001','e9500000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000003','2027-01-01','test-authority-source')$$,
  'P0001',
  'Candidate examination-centre assignment is not covered by the school centre assignment',
  'candidate cannot be assigned to a centre not designated for the school'
);
select throws_like(
  $$insert into public.examination_candidate_centre_assignments(tenant_id,school_id,examination_cycle_id,candidate_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001','e9500000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000002','2026-06-01','test-authority-source')$$,
  '%conflicting key value violates exclusion constraint%',
  'overlapping candidate centre assignments are rejected'
);

select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select assigned_school_count from public.list_examination_centres_scope('2026-08-01')),
  1::bigint,
  'school examination manager sees only their school contribution to a shared centre'
);
select is(
  (select candidate_count from public.list_examination_centres_scope('2026-08-01')),
  1::bigint,
  'school examination manager centre aggregate reconciles canonical candidate assignment'
);
reset role;

select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select candidate_count from public.list_examination_centres_scope('2026-08-01')),
  1::bigint,
  'second school can independently associate its candidate with the same centre'
);
reset role;

select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.examination_centres),
  0,
  'unauthorized school user cannot enumerate examination centres'
);
select throws_like(
  $$insert into public.school_examination_centre_assignments(tenant_id,school_id,examination_centre_id,effective_from,source_name)
    values('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','e9700000-0000-4000-8000-000000000003','2027-01-01','test-authority-source')$$,
  '%violates row-level security policy%',
  'unauthorized user cannot create school centre assignments'
);
reset role;

select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select assigned_school_count from public.list_examination_centres_scope('2026-08-01')),
  1::bigint,
  'circuit aggregate includes only schools in the caller network scope'
);
select is(
  (select candidate_count from public.list_examination_centres_scope('2026-08-01')),
  1::bigint,
  'circuit aggregate cannot include out-of-scope candidate contributions'
);
select ok(
  not ((select to_jsonb(r) from public.list_examination_centres_scope('2026-08-01') r) ?| array['school_id','candidate_id','learner_id','candidate_number','learner_name']),
  'network centre projection exposes no school/candidate/learner identity fields'
);
select is(
  (select count(*)::integer from public.examination_candidates),
  0,
  'network centre visibility does not grant direct examination-candidate access'
);
select is(
  (select count(*)::integer from public.examination_candidate_centre_assignments),
  0,
  'network centre visibility does not grant direct candidate-centre assignment access'
);
reset role;

select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_examination_centres_scope('2026-08-01')),
  0,
  'expired network membership cannot regain centre visibility through historical scope'
);
reset role;

select ok(
  not has_function_privilege('anon','public.list_examination_centres_scope(date)','EXECUTE'),
  'anonymous callers cannot execute the N09 centre projection'
);
select ok(
  (select count(*) > 0 from public.audit_events where event_type like 'examination_centre.%'),
  'N09 mutations are written to the canonical audit_events ledger'
);
select is(
  (select emis_number from public.schools where id='e9200000-0000-4000-8000-000000000001'),
  'N09-EMIS-A'::text,
  'school EMIS remains independent from examination-centre identifiers'
);
select is(
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='examination_candidate_centre_assignments' and column_name='learner_id'),
  0,
  'candidate-centre association reuses canonical candidate identity without duplicating learner identity'
);

select * from finish();
rollback;
