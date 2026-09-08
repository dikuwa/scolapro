begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('d1000000-0000-4000-8000-000000000001','ops-circuit@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000002','ops-region@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000003','ops-expired@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000004','ops-other-region@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('d1100000-0000-4000-8000-000000000001','Operational analytics tenant','operational-analytics-test','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('d1200000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','Ops School A1','OPS-A1','Region A','Town A1','active'),
  ('d1200000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','Ops School A2','OPS-A2','Region A','Town A2','active'),
  ('d1200000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000001','Ops School B1','OPS-B1','Region B','Town B1','active');

insert into public.education_authorities(id,name) values
  ('d1300000-0000-4000-8000-000000000001','Ops Authority');
insert into public.education_regions(id,name) values
  ('d1310000-0000-4000-8000-000000000001','Ops Region A'),
  ('d1310000-0000-4000-8000-000000000002','Ops Region B');
insert into public.education_circuits(id,name) values
  ('d1320000-0000-4000-8000-000000000001','Ops Circuit A1'),
  ('d1320000-0000-4000-8000-000000000002','Ops Circuit A2'),
  ('d1320000-0000-4000-8000-000000000003','Ops Circuit B1');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from) values
  ('d1330000-0000-4000-8000-000000000001','d1310000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001','2020-01-01'),
  ('d1330000-0000-4000-8000-000000000002','d1310000-0000-4000-8000-000000000002','d1300000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
  ('d1340000-0000-4000-8000-000000000001','d1320000-0000-4000-8000-000000000001','d1310000-0000-4000-8000-000000000001','2020-01-01'),
  ('d1340000-0000-4000-8000-000000000002','d1320000-0000-4000-8000-000000000002','d1310000-0000-4000-8000-000000000001','2020-01-01'),
  ('d1340000-0000-4000-8000-000000000003','d1320000-0000-4000-8000-000000000003','d1310000-0000-4000-8000-000000000002','2020-01-01');

insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
  ('d1350000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001','d1310000-0000-4000-8000-000000000001','d1320000-0000-4000-8000-000000000001','2020-01-01'),
  ('d1350000-0000-4000-8000-000000000002','d1200000-0000-4000-8000-000000000002','d1300000-0000-4000-8000-000000000001','d1310000-0000-4000-8000-000000000001','d1320000-0000-4000-8000-000000000002','2026-01-01'),
  ('d1350000-0000-4000-8000-000000000003','d1200000-0000-4000-8000-000000000003','d1300000-0000-4000-8000-000000000001','d1310000-0000-4000-8000-000000000002','d1320000-0000-4000-8000-000000000003','2020-01-01');

insert into public.education_network_memberships(id,user_id,role_key,region_id,circuit_id,active_from,active_to) values
  ('d1360000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','circuit_officer',null,'d1320000-0000-4000-8000-000000000001','2025-01-01',null),
  ('d1360000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','regional_officer','d1310000-0000-4000-8000-000000000001',null,'2025-01-01',null),
  ('d1360000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','regional_officer','d1310000-0000-4000-8000-000000000001',null,'2024-01-01','2025-12-31'),
  ('d1360000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004','regional_officer','d1310000-0000-4000-8000-000000000002',null,'2025-01-01',null);

insert into public.staffing_establishment_posts(id,tenant_id,school_id,title,effective_from,created_by_user_id) values
  ('d1400000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','A1 Post 1','2025-01-01','d1000000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','A1 Post 2','2025-01-01','d1000000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000002','A2 Post 1','2026-01-01','d1000000-0000-4000-8000-000000000002'),
  ('d1400000-0000-4000-8000-000000000004','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Post 1','2025-01-01','d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000005','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Post 2','2025-01-01','d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000006','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Post 3','2025-01-01','d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000007','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Post 4','2025-01-01','d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000008','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Post 5','2025-01-01','d1000000-0000-4000-8000-000000000004');

insert into public.school_hostels(id,tenant_id,school_id,hostel_type,capacity,active_from,created_by_user_id) values
  ('d1500000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','boarding',100,'2025-01-01','d1000000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000002','boarding',50,'2026-01-01','d1000000-0000-4000-8000-000000000002'),
  ('d1500000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','boarding',999,'2025-01-01','d1000000-0000-4000-8000-000000000004');

insert into public.school_feeding_programmes(id,tenant_id,school_id,programme_name,programme_type,active_from,created_by_user_id) values
  ('d1600000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','A1 Feeding','government','2025-01-01','d1000000-0000-4000-8000-000000000001'),
  ('d1600000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000002','A2 Feeding','government','2026-01-01','d1000000-0000-4000-8000-000000000002'),
  ('d1600000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','B1 Feeding','government','2025-01-01','d1000000-0000-4000-8000-000000000004');
insert into public.feeding_service_days(id,tenant_id,school_id,programme_id,service_date,beneficiary_count,meal_count,created_by_user_id) values
  ('d1610000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','2026-03-01',20,20,'d1000000-0000-4000-8000-000000000001'),
  ('d1610000-0000-4000-8000-000000000002','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000002','d1600000-0000-4000-8000-000000000002','2026-03-01',30,30,'d1000000-0000-4000-8000-000000000002'),
  ('d1610000-0000-4000-8000-000000000003','d1100000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000003','d1600000-0000-4000-8000-000000000003','2026-03-01',999,999,'d1000000-0000-4000-8000-000000000004');

select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select is((select scoped_school_count from public.network_operational_summary_as_of('2026-04-01')),1::bigint,'circuit officer sees one authorized circuit school');
select is((select establishment_posts from public.network_operational_summary_as_of('2026-04-01')),2::bigint,'circuit staffing aggregate excludes other circuits');
select is((select active_hostel_capacity from public.network_operational_summary_as_of('2026-04-01')),100::bigint,'circuit hostel aggregate excludes other circuits');
select is((select feeding_meals_to_date from public.network_operational_summary_as_of('2026-04-01')),20::bigint,'circuit feeding aggregate reconciles to authorized source rows');
select is(
  (select scoped_school_count from public.network_operational_summary_as_of('2026-04-01')),
  (select scoped_school_count from public.network_canonical_metric_as_of('network.school_count','2026-04-01')),
  'operational school scope reconciles to canonical metric registry implementation'
);

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select is((select scoped_school_count from public.network_operational_summary_as_of('2026-04-01')),2::bigint,'regional officer sees both schools in authorized region');
select is((select establishment_posts from public.network_operational_summary_as_of('2026-04-01')),3::bigint,'regional staffing aggregate reconciles without cross-region leakage');
select is((select feeding_meals_to_date from public.network_operational_summary_as_of('2026-04-01')),50::bigint,'regional feeding aggregate excludes Region B');
select is((select scoped_school_count from public.network_operational_summary_as_of('2025-06-01')),1::bigint,'as-of school placement excludes later network assignments');
select is(
  (select support_cases from public.network_operational_summary_as_of('2026-04-01')),
  (select support_cases from public.network_inclusion_support_summary_as_of('2026-04-01')),
  'support count composes the existing N16 network disclosure boundary'
);
select ok(
  not ((select to_jsonb(r) from public.network_operational_summary_as_of('2026-04-01') r) ?| array[
    'school_id','school_name','learner_id','learner_name','enrolment_id','staff_member_id','employee_number',
    'support_case_id','case_type','intervention_type','notes','diagnosis','access_arrangement_id','arrangement_type'
  ]),
  'operational surface exposes no school, learner, staff, support-case or examination-access detail'
);

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
select is((select scoped_school_count from public.network_operational_summary_as_of('2026-04-01')),1::bigint,'other regional officer remains isolated to Region B');
select is((select establishment_posts from public.network_operational_summary_as_of('2026-04-01')),5::bigint,'Region B staffing count is isolated from Region A');
select is((select active_hostel_capacity from public.network_operational_summary_as_of('2026-04-01')),999::bigint,'Region B hostel capacity is isolated from Region A');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.network_operational_summary_as_of('2025-06-01')$$,
  'Permission denied',
  'expired network membership is denied even for a historical reference date'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_like(
  $$select * from public.network_operational_summary_as_of('2026-04-01')$$,
  '%permission denied for function network_operational_summary_as_of%',
  'anonymous execution is denied'
);
reset role;

select * from finish();
rollback;
