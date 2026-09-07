begin;

select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f1000000-0000-4000-8000-000000000001','n16-principal-a@example.test','authenticated','authenticated',now(),now()),
('f1000000-0000-4000-8000-000000000002','n16-admin-a@example.test','authenticated','authenticated',now(),now()),
('f1000000-0000-4000-8000-000000000003','n16-principal-b@example.test','authenticated','authenticated',now(),now()),
('f1000000-0000-4000-8000-000000000004','n16-circuit@example.test','authenticated','authenticated',now(),now()),
('f1000000-0000-4000-8000-000000000005','n16-expired-network@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('f1100000-0000-4000-8000-000000000001','N16 aggregate tenant','n16-aggregate-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
('f1200000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','N16 School A','N16-A','Test Region','Town A','active'),
('f1200000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001','N16 School B','N16-B','Test Region','Town B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','principal','2026-01-01'),
('f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','school_admin','2026-01-01'),
('f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','principal','2026-01-01');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('f1300000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','N16','Learner One','female'),
('f1300000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001','N16','Learner Two','male'),
('f1300000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001','N16','Learner Three','female');

-- case_type and intervention_type are deliberately free text in the canonical
-- schema. N16 does not elevate these values into invented SEN classifications.
insert into public.learner_support_cases(
  id,tenant_id,school_id,learner_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id,closed_on
) values
('f1400000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-000000000001','2026-01-10','local-free-text-a','restricted','Sensitive summary A','closed','f1000000-0000-4000-8000-000000000001','2026-06-30'),
('f1400000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-000000000002','2026-03-01','local-free-text-b','highly_restricted','Sensitive summary B','open','f1000000-0000-4000-8000-000000000001',null),
('f1400000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000002','f1300000-0000-4000-8000-000000000003','2026-02-01','local-free-text-c','restricted','Sensitive summary C','open','f1000000-0000-4000-8000-000000000003',null);

insert into public.learner_support_interventions(
  id,tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
) values
('f1500000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1400000-0000-4000-8000-000000000001','2026-02-01','private-type-a','Private counselling note A','f1000000-0000-4000-8000-000000000001'),
('f1500000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1400000-0000-4000-8000-000000000001','2026-05-01','private-type-b','Private counselling note B','f1000000-0000-4000-8000-000000000001'),
('f1500000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1400000-0000-4000-8000-000000000002','2026-03-15','private-type-c','Private counselling note C','f1000000-0000-4000-8000-000000000001'),
('f1500000-0000-4000-8000-000000000004','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000002','f1400000-0000-4000-8000-000000000003','2026-02-15','private-type-d','Private counselling note D','f1000000-0000-4000-8000-000000000003');

insert into public.education_authorities(id,name)
values('f1600000-0000-4000-8000-000000000001','N16 authority');
insert into public.education_regions(id,name)
values('f1610000-0000-4000-8000-000000000001','N16 region');
insert into public.education_circuits(id,name) values
('f1620000-0000-4000-8000-000000000001','N16 circuit A'),
('f1620000-0000-4000-8000-000000000002','N16 circuit B');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('f1630000-0000-4000-8000-000000000001','f1610000-0000-4000-8000-000000000001','f1600000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
('f1640000-0000-4000-8000-000000000001','f1620000-0000-4000-8000-000000000001','f1610000-0000-4000-8000-000000000001','2020-01-01'),
('f1640000-0000-4000-8000-000000000002','f1620000-0000-4000-8000-000000000002','f1610000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
('f1650000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1600000-0000-4000-8000-000000000001','f1610000-0000-4000-8000-000000000001','f1620000-0000-4000-8000-000000000001','2020-01-01'),
('f1650000-0000-4000-8000-000000000002','f1200000-0000-4000-8000-000000000002','f1600000-0000-4000-8000-000000000001','f1610000-0000-4000-8000-000000000001','f1620000-0000-4000-8000-000000000002','2020-01-01');

insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from,active_to) values
('f1660000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004','circuit_officer','f1620000-0000-4000-8000-000000000001','2026-01-01',null),
('f1660000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000005','circuit_officer','f1620000-0000-4000-8000-000000000001','2025-01-01','2025-12-31');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is(
  (select support_cases from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01')),
  2::bigint,
  'school aggregate reconciles effective canonical support cases'
);
select is(
  (select learners_with_support from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01')),
  2::bigint,
  'school aggregate reconciles distinct learners without exposing identity'
);
select is(
  (select interventions_to_date from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01')),
  2::bigint,
  'school aggregate reconciles interventions for cases effective as-of the date'
);
select is(
  (select support_cases from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-02-15')),
  1::bigint,
  'historical as-of count reproduces the earlier support population after later closure'
);
select is(
  (select support_cases from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-07-01')),
  1::bigint,
  'post-closure as-of count excludes the ended support case'
);
select ok(
  not ((select to_jsonb(r) from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01') r) ?| array['learner_id','learner_name','case_type','summary','note','intervention_type','support_case_id']),
  'school aggregate output contains no learner identity or sensitive case detail fields'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select * from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01')$$,
  'Permission denied',
  'generic school administrator is denied support aggregate access'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.school_inclusion_support_summary_as_of('f1200000-0000-4000-8000-000000000001','2026-04-01')$$,
  'Permission denied',
  'principal from another school cannot read cross-school support aggregate'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
select is(
  (select scoped_school_count from public.network_inclusion_support_summary_as_of('2026-04-01')),
  1::bigint,
  'network aggregate includes only schools in the caller current circuit scope'
);
select is(
  (select support_cases from public.network_inclusion_support_summary_as_of('2026-04-01')),
  2::bigint,
  'network aggregate excludes support facts from an out-of-scope school'
);
select is(
  (select learners_with_support from public.network_inclusion_support_summary_as_of('2026-04-01')),
  2::bigint,
  'network learner count reconciles without exposing learner rows'
);
select ok(
  not ((select to_jsonb(r) from public.network_inclusion_support_summary_as_of('2026-04-01') r) ?| array['school_id','learner_id','learner_name','case_type','summary','note','intervention_type','support_case_id']),
  'network aggregate exposes neither per-school nor learner/case detail'
);
select is(
  (select count(*)::integer from public.learner_support_cases),
  0,
  'network role receives no direct learner-support case access through RLS'
);
select is(
  (select count(*)::integer from public.learner_support_interventions),
  0,
  'network role receives no direct support-intervention access through RLS'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select * from public.network_inclusion_support_summary_as_of('2025-06-01')$$,
  'Permission denied',
  'expired network membership cannot regain aggregate access with a historical date'
);

select is(
  (select count(*)::integer from information_schema.tables where table_schema='public' and table_name like '%sen%'),
  0,
  'N16 creates no parallel SEN fact table'
);
select ok(
  not has_function_privilege('anon','public.school_inclusion_support_summary_as_of(uuid,date)','EXECUTE')
  and not has_function_privilege('anon','public.network_inclusion_support_summary_as_of(date)','EXECUTE'),
  'anonymous callers cannot execute N16 aggregate RPCs'
);
select ok(
  has_function_privilege('authenticated','public.school_inclusion_support_summary_as_of(uuid,date)','EXECUTE')
  and has_function_privilege('authenticated','public.network_inclusion_support_summary_as_of(date)','EXECUTE'),
  'authenticated execution is exposed only through the bounded aggregate RPCs'
);

select * from finish();
rollback;
