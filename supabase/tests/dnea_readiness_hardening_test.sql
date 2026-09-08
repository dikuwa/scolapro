begin;

select plan(16);

-- Dedicated auth actors.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('db000000-0000-4000-8000-000000000001','dnea-hardening-active@example.test','authenticated','authenticated',now(),now()),
 ('db000000-0000-4000-8000-000000000002','dnea-hardening-expired@example.test','authenticated','authenticated',now(),now()),
 ('db000000-0000-4000-8000-000000000003','dnea-hardening-cross@example.test','authenticated','authenticated',now(),now()),
 ('db000000-0000-4000-8000-000000000004','dnea-hardening-school@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values (
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db000000-0000-4000-8000-000000000004',
 'exam_officer',
 '2026-01-01'
);

insert into public.education_authorities(id,name) values
 ('db100000-0000-4000-8000-000000000001','DNEA hardening authority');
insert into public.education_regions(id,name) values
 ('db110000-0000-4000-8000-000000000001','DNEA hardening region');
insert into public.education_circuits(id,name) values
 ('db120000-0000-4000-8000-000000000001','DNEA hardening assigned circuit'),
 ('db120000-0000-4000-8000-000000000002','DNEA hardening other circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values (
 'db200000-0000-4000-8000-000000000001',
 'db110000-0000-4000-8000-000000000001',
 'db100000-0000-4000-8000-000000000001',
 '2020-01-01'
);
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
 ('db210000-0000-4000-8000-000000000001','db120000-0000-4000-8000-000000000001','db110000-0000-4000-8000-000000000001','2020-01-01'),
 ('db210000-0000-4000-8000-000000000002','db120000-0000-4000-8000-000000000002','db110000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(
 id,school_id,authority_id,region_id,circuit_id,effective_from
) values (
 'db300000-0000-4000-8000-000000000001',
 '22222222-2222-4222-8222-222222222222',
 'db100000-0000-4000-8000-000000000001',
 'db110000-0000-4000-8000-000000000001',
 'db120000-0000-4000-8000-000000000001',
 '2020-01-01'
);

-- Current membership, historical-only expired membership, and wrong circuit.
insert into public.education_network_memberships(
 id,user_id,role_key,circuit_id,active_from,active_to
) values
 ('db310000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','circuit_officer','db120000-0000-4000-8000-000000000001','2026-01-01',null),
 ('db310000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000002','circuit_officer','db120000-0000-4000-8000-000000000001','2026-01-01','2026-07-01'),
 ('db310000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000003','circuit_officer','db120000-0000-4000-8000-000000000002','2026-01-01',null);

insert into public.examination_cycles(
 id,tenant_id,school_id,academic_year,cycle_key,display_name
) values (
 'db400000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 2026,'HARDENING-TEST','DNEA hardening test'
);

-- Candidate insert is itself a canonical mutation and must compile readiness.
insert into public.examination_candidates(
 id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
) values (
 'db410000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db400000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000001',
 'db000000-0000-4000-8000-000000000004'
);

select is(
 (select count(*)::integer from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='identity_incomplete' and resolved=false),
 1,
 'candidate insert transactionally compiles identity readiness'
);
select is(
 (select count(*)::integer from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='no_subjects' and resolved=false),
 1,
 'candidate insert transactionally compiles subject readiness'
);

update public.examination_candidates
set identity_verified=true
where id='db410000-0000-4000-8000-000000000001';
select is(
 (select count(*)::integer from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='identity_incomplete' and resolved=false),
 0,
 'candidate mutation cannot leave identity readiness stale'
);

insert into public.examination_subject_registrations(
 id,tenant_id,school_id,candidate_id,subject_code,subject_name
) values (
 'db420000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db410000-0000-4000-8000-000000000001',
 'SOURCE-ONLY','Source-provenanced test subject'
);
select is(
 (select count(*)::integer from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='no_subjects' and resolved=false),
 0,
 'subject registration mutation removes stale no-subject issue without manual refresh'
);
select is(
 (select count(*)::integer from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='subject_code_missing_mapping' and resolved=false),
 1,
 'existing readiness engine still derives the configured missing-mapping warning'
);

-- With no new centre/access rule invented, prove those canonical mutation families
-- still invoke the same readiness recompiler by observing replacement of a surviving
-- derived warning row.
create temporary table _readiness_marker(issue_id uuid);
insert into _readiness_marker
select id from public.examination_readiness_issues
where candidate_id='db410000-0000-4000-8000-000000000001'
  and issue_code='subject_code_missing_mapping' and resolved=false;

insert into public.examination_centres(id,display_name)
values('db500000-0000-4000-8000-000000000001','DNEA hardening centre');
insert into public.school_examination_centre_assignments(
 id,tenant_id,school_id,examination_centre_id,effective_from,source_name
) values (
 'db510000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db500000-0000-4000-8000-000000000001',
 '2026-01-01','test-authority'
);
select isnt(
 (select id from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='subject_code_missing_mapping' and resolved=false),
 (select issue_id from _readiness_marker),
 'school examination-centre assignment mutation recompiles readiness snapshot'
);
update _readiness_marker set issue_id=(
 select id from public.examination_readiness_issues
 where candidate_id='db410000-0000-4000-8000-000000000001'
   and issue_code='subject_code_missing_mapping' and resolved=false
);

insert into public.examination_centre_status_history(
 id,examination_centre_id,status_value,source_name,effective_from
) values (
 'db520000-0000-4000-8000-000000000001',
 'db500000-0000-4000-8000-000000000001',
 'source-status','test-authority','2026-01-01'
);
select isnt(
 (select id from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='subject_code_missing_mapping' and resolved=false),
 (select issue_id from _readiness_marker),
 'examination-centre status mutation recompiles readiness snapshot without inventing a readiness rule'
);
update _readiness_marker set issue_id=(
 select id from public.examination_readiness_issues
 where candidate_id='db410000-0000-4000-8000-000000000001'
   and issue_code='subject_code_missing_mapping' and resolved=false
);

insert into public.examination_access_arrangements(
 id,tenant_id,school_id,examination_cycle_id,candidate_id,
 arrangement_value,source_name,effective_from,recorded_by_user_id
) values (
 'db600000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db400000-0000-4000-8000-000000000001',
 'db410000-0000-4000-8000-000000000001',
 'source-arrangement','test-authority','2026-01-01',
 'db000000-0000-4000-8000-000000000004'
);
select isnt(
 (select id from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='subject_code_missing_mapping' and resolved=false),
 (select issue_id from _readiness_marker),
 'N10 arrangement mutation recompiles readiness snapshot without exposing arrangement detail'
);
update _readiness_marker set issue_id=(
 select id from public.examination_readiness_issues
 where candidate_id='db410000-0000-4000-8000-000000000001'
   and issue_code='subject_code_missing_mapping' and resolved=false
);

insert into public.examination_access_arrangement_status_history(
 id,arrangement_id,tenant_id,school_id,examination_cycle_id,candidate_id,
 status_value,source_name,effective_from,recorded_by_user_id
) values (
 'db610000-0000-4000-8000-000000000001',
 'db600000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'db400000-0000-4000-8000-000000000001',
 'db410000-0000-4000-8000-000000000001',
 'source-status','test-authority','2026-01-01',
 'db000000-0000-4000-8000-000000000004'
);
select isnt(
 (select id from public.examination_readiness_issues
  where candidate_id='db410000-0000-4000-8000-000000000001'
    and issue_code='subject_code_missing_mapping' and resolved=false),
 (select issue_id from _readiness_marker),
 'N10 arrangement status mutation recompiles readiness snapshot'
);

-- Authorization date and fact date are independent.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','db000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.list_dnea_readiness_scope('2026-06-01')
  where examination_cycle_id='db400000-0000-4000-8000-000000000001'),
 1,
 'active current network member may read intended historical aggregate scope'
);
select is(
 (select access_scope from public.list_dnea_readiness_scope('2026-06-01')
  where examination_cycle_id='db400000-0000-4000-8000-000000000001'),
 'network',
 'network readiness remains aggregate-scoped'
);
reset role;

select set_config('request.jwt.claim.sub','db000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.list_dnea_readiness_scope('2026-06-01')
  where examination_cycle_id='db400000-0000-4000-8000-000000000001'),
 0,
 'expired network member cannot regain access through historical p_as_of'
);
reset role;

select set_config('request.jwt.claim.sub','db000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.list_dnea_readiness_scope('2026-06-01')
  where examination_cycle_id='db400000-0000-4000-8000-000000000001'),
 0,
 'cross-network circuit member is denied readiness aggregate'
);
reset role;

select set_config('request.jwt.claim.sub','db000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.get_dnea_candidate_readiness('db400000-0000-4000-8000-000000000001')),
 1,
 'school examination manager retains candidate readiness authority'
);
reset role;

select ok(
 not has_function_privilege('anon','public.list_dnea_readiness_scope(date)','EXECUTE'),
 'anonymous role has no DNEA readiness aggregate execute privilege'
);

-- Snapshot remains one regenerable projection, not parallel truth.
select is(
 (select count(*)::integer from information_schema.tables
  where table_schema='public' and table_name in ('dnea_readiness_snapshots','candidate_readiness_snapshots')),
 0,
 'hardening adds no duplicate readiness truth store'
);

select * from finish();
rollback;
