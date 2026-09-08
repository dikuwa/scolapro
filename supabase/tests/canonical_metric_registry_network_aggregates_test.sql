begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('b2000000-0000-4000-8000-000000000001','metric-circuit@example.test','authenticated','authenticated',now(),now()),
  ('b2000000-0000-4000-8000-000000000002','metric-expired@example.test','authenticated','authenticated',now(),now()),
  ('b2000000-0000-4000-8000-000000000003','metric-no-network@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('b2100000-0000-4000-8000-000000000001','Canonical metric tenant','canonical-metric-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('b2200000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000001','Metric School A','METRIC-A','Metric Region','Town A','active'),
  ('b2200000-0000-4000-8000-000000000002','b2100000-0000-4000-8000-000000000001','Metric School B','METRIC-B','Metric Region','Town B','active');

insert into public.education_authorities(id,name)
values('b2300000-0000-4000-8000-000000000001','Metric authority');

insert into public.education_regions(id,name)
values('b2310000-0000-4000-8000-000000000001','Metric region');

insert into public.education_circuits(id,name) values
  ('b2320000-0000-4000-8000-000000000001','Metric circuit A'),
  ('b2320000-0000-4000-8000-000000000002','Metric circuit B');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('b2330000-0000-4000-8000-000000000001','b2310000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000001','2020-01-01');

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
  ('b2340000-0000-4000-8000-000000000001','b2320000-0000-4000-8000-000000000001','b2310000-0000-4000-8000-000000000001','2020-01-01'),
  ('b2340000-0000-4000-8000-000000000002','b2320000-0000-4000-8000-000000000002','b2310000-0000-4000-8000-000000000001','2020-01-01');

insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
  ('b2350000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000001','b2310000-0000-4000-8000-000000000001','b2320000-0000-4000-8000-000000000001','2020-01-01'),
  ('b2350000-0000-4000-8000-000000000002','b2200000-0000-4000-8000-000000000002','b2300000-0000-4000-8000-000000000001','b2310000-0000-4000-8000-000000000001','b2320000-0000-4000-8000-000000000002','2020-01-01');

insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from,active_to) values
  ('b2360000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','circuit_officer','b2320000-0000-4000-8000-000000000001','2026-01-01',null),
  ('b2360000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','circuit_officer','b2320000-0000-4000-8000-000000000001','2025-01-01','2025-12-31');

select is(
  (select network_safe from public.canonical_metric_registry where metric_key='network.school_count'),
  true,
  'network school count is explicitly registered as network safe'
);

select is(
  (select source_domain from public.canonical_metric_registry where metric_key='network.school_count'),
  'education_network'::text,
  'metric registry records the canonical source domain'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);

select is(
  (select scoped_school_count from public.network_canonical_metric_as_of('network.school_count','2026-04-01')),
  1::bigint,
  'circuit metric scope contains only the caller authorized circuit school'
);

select is(
  (select metric_value from public.network_canonical_metric_as_of('network.school_count','2026-04-01')),
  1::numeric,
  'network school count reconciles to effective canonical network assignments'
);

select ok(
  not ((select to_jsonb(r) from public.network_canonical_metric_as_of('network.school_count','2026-04-01') r) ?| array['school_id','school_name','learner_id','learner_name']),
  'network metric surface exposes no per-school or learner identity fields'
);

select is(
  (select count(*)::integer from public.canonical_metric_registry where metric_key='network.school_count'),
  1,
  'authenticated callers may read non-sensitive canonical metric metadata'
);

select throws_ok(
  $$insert into public.canonical_metric_registry(metric_key,display_name,description,unit,value_type,aggregation_method,source_domain,network_safe,effective_from) values('network.injected','Injected','Must fail','rows','integer','count','education_network',true,current_date)$$,
  '42501',
  'new row violates row-level security policy for table "canonical_metric_registry"',
  'authenticated callers cannot mutate canonical metric definitions'
);

select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.unknown','2026-04-01')$$,
  'Metric is not available for network aggregation',
  'unregistered metrics cannot be executed'
);

reset role;
insert into public.canonical_metric_registry(
  metric_key,display_name,description,unit,value_type,aggregation_method,source_domain,network_safe,effective_from
) values (
  'network.private_test','Private test','Non-network-safe registry fixture','rows','integer','count','education_network',false,'2020-01-01'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.private_test','2026-04-01')$$,
  'Metric is not available for network aggregation',
  'registry metadata not marked network safe cannot cross the network aggregate boundary'
);

select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.school_count','2025-06-01')$$,
  'Permission denied',
  'expired network membership cannot be revived by a historical metric date'
);

select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.network_canonical_metric_as_of('network.school_count','2026-04-01')$$,
  'Permission denied',
  'authenticated caller without network authority is denied'
);

select * from finish();
rollback;
