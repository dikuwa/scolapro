begin;

select plan(22);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('55500000-0000-4000-8000-000000000001','network-qa-circuit@example.test','authenticated','authenticated',now(),now()),
  ('55500000-0000-4000-8000-000000000002','network-qa-school-admin@example.test','authenticated','authenticated',now(),now()),
  ('55500000-0000-4000-8000-000000000003','network-qa-support@example.test','authenticated','authenticated',now(),now()),
  ('55500000-0000-4000-8000-000000000004','network-qa-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('55500000-0000-4000-8000-000000000003','platform_support',current_date),
  ('55500000-0000-4000-8000-000000000004','platform_admin',current_date);

insert into public.tenants(id,name,slug,status)
values('55510000-0000-4000-8000-000000000001','Network QA Tenant','network-qa-555','active');

insert into public.schools(id,tenant_id,name,status) values
  ('55520000-0000-4000-8000-000000000001','55510000-0000-4000-8000-000000000001','Network QA School A','active'),
  ('55520000-0000-4000-8000-000000000002','55510000-0000-4000-8000-000000000001','Network QA School B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('55510000-0000-4000-8000-000000000001','55520000-0000-4000-8000-000000000001','55500000-0000-4000-8000-000000000002','school_admin',current_date-10);

insert into public.education_authorities(id,name)
values('55530000-0000-4000-8000-000000000001','Network QA Authority');
insert into public.education_regions(id,name) values
  ('55531000-0000-4000-8000-000000000001','Network QA Region A'),
  ('55531000-0000-4000-8000-000000000002','Network QA Region B');
insert into public.education_circuits(id,name) values
  ('55532000-0000-4000-8000-000000000001','Network QA Circuit A'),
  ('55532000-0000-4000-8000-000000000002','Network QA Circuit B');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from) values
  ('55533000-0000-4000-8000-000000000001','55531000-0000-4000-8000-000000000001','55530000-0000-4000-8000-000000000001','2020-01-01'),
  ('55533000-0000-4000-8000-000000000002','55531000-0000-4000-8000-000000000002','55530000-0000-4000-8000-000000000001','2020-01-01');

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
  ('55534000-0000-4000-8000-000000000001','55532000-0000-4000-8000-000000000001','55531000-0000-4000-8000-000000000001','2020-01-01'),
  ('55534000-0000-4000-8000-000000000002','55532000-0000-4000-8000-000000000002','55531000-0000-4000-8000-000000000002','2020-01-01');

insert into public.school_network_assignments(
  id,school_id,authority_id,region_id,circuit_id,effective_from,effective_to
) values
  ('55535000-0000-4000-8000-000000000001','55520000-0000-4000-8000-000000000001','55530000-0000-4000-8000-000000000001','55531000-0000-4000-8000-000000000001','55532000-0000-4000-8000-000000000001','2025-01-01','2025-12-31'),
  ('55535000-0000-4000-8000-000000000002','55520000-0000-4000-8000-000000000001','55530000-0000-4000-8000-000000000001','55531000-0000-4000-8000-000000000002','55532000-0000-4000-8000-000000000002','2026-01-01',null),
  ('55535000-0000-4000-8000-000000000003','55520000-0000-4000-8000-000000000002','55530000-0000-4000-8000-000000000001','55531000-0000-4000-8000-000000000001','55532000-0000-4000-8000-000000000001','2025-01-01',null);

insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from) values
  ('55536000-0000-4000-8000-000000000001','55500000-0000-4000-8000-000000000001','circuit_officer','55532000-0000-4000-8000-000000000001',current_date-20);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','55500000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select scoped_school_count from public.network_canonical_metric_as_of('network.school_count','2025-06-01')),
  2::bigint,
  'historical network aggregate includes only schools effectively in the authorized circuit on the as-of date'
);

select is(
  (select scoped_school_count from public.network_canonical_metric_as_of('network.school_count','2026-06-01')),
  1::bigint,
  'ended school relationship is excluded after the school moves to another circuit'
);

select is(
  (select scoped_school_count from public.network_operational_summary_as_of('2025-06-01')),
  2::bigint,
  'operational analytics uses the same effective historical network boundary'
);

select is(
  (select scoped_school_count from public.network_operational_summary_as_of('2026-06-01')),
  1::bigint,
  'operational analytics does not double-count an ended and replacement school relationship'
);

select ok(
  not ((select to_jsonb(r) from public.network_operational_summary_as_of('2025-06-01') r) ?| array[
    'school_id','school_name','learner_id','learner_name','enrolment_id','staff_member_id',
    'support_case_id','case_type','intervention_type','notes','diagnosis',
    'candidate_id','candidate_number','access_arrangement_id','arrangement_type'
  ]),
  'network operational aggregate surface exposes no restricted individual or school-detail fields'
);

reset role;

select set_config('request.jwt.claim.sub','55500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.school_count','2025-06-01')$$,
  'Permission denied',
  'school administrator cannot read network aggregates merely through school authority'
);
select throws_ok(
  $$select * from public.network_operational_summary_as_of('2025-06-01')$$,
  'Permission denied',
  'school administrator cannot read unrelated network operational aggregates'
);
reset role;

select set_config('request.jwt.claim.sub','55500000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.school_count','2025-06-01')$$,
  'Permission denied',
  'Platform Support does not inherit network aggregate authority'
);
select throws_ok(
  $$select * from public.network_operational_summary_as_of('2025-06-01')$$,
  'Permission denied',
  'Platform Support remains separated from operational network analytics'
);
reset role;

select set_config('request.jwt.claim.sub','55500000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.school_count','2025-06-01')$$,
  'Permission denied',
  'Platform Admin does not bypass explicit circuit/regional aggregate scope without a network membership'
);
select throws_ok(
  $$select * from public.network_operational_summary_as_of('2025-06-01')$$,
  'Permission denied',
  'Platform Admin network analytics behavior remains bounded by explicit network authority'
);
reset role;

select lives_ok(
  $$update public.canonical_metric_registry
      set effective_to='2025-12-31'
    where metric_key='network.school_count' and effective_from='2020-01-01'$$,
  'fixture may close the original metric definition while running outside authenticated RLS'
);

select lives_ok(
  $$insert into public.canonical_metric_registry(
      metric_key,display_name,description,unit,value_type,aggregation_method,
      source_domain,network_safe,effective_from,effective_to
    ) values(
      'network.school_count',
      'Schools in network scope v2',
      'Second effective definition for QA; aggregation implementation remains explicit and fixed.',
      'schools','integer','count','education_network',true,'2026-01-01',null
    )$$,
  'canonical registry supports a later non-overlapping version for the same metric key'
);

select is(
  (select count(*)::integer from public.canonical_metric_registry where metric_key='network.school_count'),
  2,
  'two effective-dated versions coexist in the single canonical metric registry'
);

select throws_like(
  $$insert into public.canonical_metric_registry(
      metric_key,display_name,description,unit,value_type,aggregation_method,
      source_domain,network_safe,effective_from,effective_to
    ) values(
      'network.school_count',
      'Overlapping definition',
      'Must be rejected',
      'schools','integer','count','education_network',true,'2025-06-01','2026-06-01'
    )$$,
  '%canonical_metric_registry_no_overlapping_versions%',
  'overlapping metric definition versions are rejected'
);

select set_config('request.jwt.claim.sub','55500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select metric_value from public.network_canonical_metric_as_of('network.school_count','2025-06-01')),
  2::numeric,
  'historical aggregate resolves against the historical metric-definition period'
);
select is(
  (select metric_value from public.network_canonical_metric_as_of('network.school_count','2026-06-01')),
  1::numeric,
  'later aggregate resolves while the later metric-definition version is effective'
);
reset role;

set local role authenticated;

select throws_ok(
  $$insert into public.canonical_metric_registry(
      metric_key,display_name,description,unit,value_type,aggregation_method,
      source_domain,network_safe,effective_from
    ) values(
      'network.qa_mutation',
      'Unauthorized mutation',
      'Must be rejected',
      'rows','integer','count','education_network',true,'2026-01-01'
    )$$,
  '42501',
  'authenticated callers cannot insert metric definitions, whether blocked by table privileges or RLS'
);

select throws_ok(
  $$update public.canonical_metric_registry
      set description = description
    where metric_key='network.school_count' and effective_from='2020-01-01'$$,
  '42501',
  'authenticated callers cannot update metric definitions, whether blocked by table privileges or RLS'
);

select throws_ok(
  $$delete from public.canonical_metric_registry
      where metric_key='network.school_count' and effective_from='2020-01-01'$$,
  '42501',
  'authenticated callers cannot delete metric definitions, whether blocked by table privileges or RLS'
);

reset role;

select is(
  (select count(*)::integer from public.canonical_metric_registry
   where metric_key='network.school_count'
     and effective_from='2020-01-01'
     and effective_to='2025-12-31'),
  1,
  'historical metric-definition period remains explicitly explainable'
);

select ok(
  not has_function_privilege('anon','public.network_canonical_metric_as_of(text,date)','EXECUTE')
  and not has_function_privilege('anon','public.network_operational_summary_as_of(date)','EXECUTE'),
  'anonymous callers cannot execute network aggregate surfaces'
);

select * from finish();
rollback;
