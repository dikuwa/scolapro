begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('c1000000-0000-4000-8000-000000000001','metric-circuit-a@example.test','authenticated','authenticated',now(),now()),
  ('c1000000-0000-4000-8000-000000000002','metric-circuit-b@example.test','authenticated','authenticated',now(),now()),
  ('c1000000-0000-4000-8000-000000000003','metric-expired@example.test','authenticated','authenticated',now(),now()),
  ('c1000000-0000-4000-8000-000000000004','metric-no-network@example.test','authenticated','authenticated',now(),now()),
  ('c1000000-0000-4000-8000-000000000005','metric-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('c1100000-0000-4000-8000-000000000001','Metric expansion tenant','metric-expansion-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('c1200000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','Metric Scope A1','METRIC-A1','Metric Region','A1','active'),
  ('c1200000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','Metric Scope A2','METRIC-A2','Metric Region','A2','active'),
  ('c1200000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','Metric Scope B','METRIC-B','Metric Region','B','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('c1210000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000005','school_admin','2020-01-01'),
  ('c1210000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000005','school_admin','2020-01-01'),
  ('c1210000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000005','school_admin','2020-01-01');

insert into public.education_authorities(id,name)
values('c1300000-0000-4000-8000-000000000001','Metric expansion authority');
insert into public.education_regions(id,name)
values('c1310000-0000-4000-8000-000000000001','Metric expansion region');
insert into public.education_circuits(id,name) values
  ('c1320000-0000-4000-8000-000000000001','Metric circuit A'),
  ('c1320000-0000-4000-8000-000000000002','Metric circuit B');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('c1330000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
  ('c1340000-0000-4000-8000-000000000001','c1320000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001','2020-01-01'),
  ('c1340000-0000-4000-8000-000000000002','c1320000-0000-4000-8000-000000000002','c1310000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
  ('c1350000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001','c1320000-0000-4000-8000-000000000001','2020-01-01'),
  ('c1350000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000002','c1300000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001','c1320000-0000-4000-8000-000000000001','2020-01-01'),
  ('c1350000-0000-4000-8000-000000000003','c1200000-0000-4000-8000-000000000003','c1300000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001','c1320000-0000-4000-8000-000000000002','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from,active_to) values
  ('c1360000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','circuit_officer','c1320000-0000-4000-8000-000000000001','2026-01-01',null),
  ('c1360000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','circuit_officer','c1320000-0000-4000-8000-000000000002','2026-01-01',null),
  ('c1360000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','circuit_officer','c1320000-0000-4000-8000-000000000001','2025-01-01','2025-12-31');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
  ('c1400000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','METRIC-S1','Metric','Staff','active');
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('c1410000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1400000-0000-4000-8000-000000000001','staff','2020-01-01','c1000000-0000-4000-8000-000000000005');
insert into public.staffing_establishment_posts(id,tenant_id,school_id,title,effective_from,effective_to,created_by_user_id) values
  ('c1420000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','A1 Post 1','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','A1 Post 2','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','A2 Post 1','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000004','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','B Post 1','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000005','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','B Post 2','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000006','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','B Post 3','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000007','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','B Post 4','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000008','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','B Post 5','2020-01-01',null,'c1000000-0000-4000-8000-000000000005'),
  ('c1420000-0000-4000-8000-000000000009','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Historical A1 Post','2025-01-01','2025-12-31','c1000000-0000-4000-8000-000000000005');
insert into public.staffing_post_occupancies(id,tenant_id,school_id,post_id,staff_school_assignment_id,effective_from,created_by_user_id)
values('c1430000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1420000-0000-4000-8000-000000000001','c1410000-0000-4000-8000-000000000001','2020-01-01','c1000000-0000-4000-8000-000000000005');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('c1500000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','Metric','Learner A1'),
  ('c1500000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','Metric','Learner A2'),
  ('c1500000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','Metric','Learner B');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
  ('c1510000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
  ('c1510000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','c1500000-0000-4000-8000-000000000002',2026,'2026-01-01','current'),
  ('c1510000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','c1500000-0000-4000-8000-000000000003',2026,'2026-01-01','current');
insert into public.school_hostels(id,tenant_id,school_id,hostel_type,capacity,staff_count,active_from,created_by_user_id) values
  ('c1520000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','boarding',100,0,'2020-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1520000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','boarding',50,0,'2020-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1520000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','boarding',999,0,'2020-01-01','c1000000-0000-4000-8000-000000000005');
insert into public.hostel_residencies(id,tenant_id,school_id,hostel_id,enrolment_id,resident_from,created_by_user_id) values
  ('c1530000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1520000-0000-4000-8000-000000000001','c1510000-0000-4000-8000-000000000001','2026-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1530000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','c1520000-0000-4000-8000-000000000002','c1510000-0000-4000-8000-000000000002','2026-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1530000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','c1520000-0000-4000-8000-000000000003','c1510000-0000-4000-8000-000000000003','2026-01-01','c1000000-0000-4000-8000-000000000005');
insert into public.school_feeding_programmes(id,tenant_id,school_id,programme_name,programme_type,active_from,created_by_user_id) values
  ('c1540000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Feeding A1','school','2020-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1540000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','Feeding A2','school','2020-01-01','c1000000-0000-4000-8000-000000000005'),
  ('c1540000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','Feeding B','school','2020-01-01','c1000000-0000-4000-8000-000000000005');
insert into public.feeding_service_days(id,tenant_id,school_id,programme_id,service_date,beneficiary_count,meal_count,created_by_user_id) values
  ('c1550000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1540000-0000-4000-8000-000000000001','2026-04-01',30,35,'c1000000-0000-4000-8000-000000000005'),
  ('c1550000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','c1540000-0000-4000-8000-000000000002','2026-04-01',20,25,'c1000000-0000-4000-8000-000000000005'),
  ('c1550000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','c1540000-0000-4000-8000-000000000003','2026-04-01',999,999,'c1000000-0000-4000-8000-000000000005');

insert into public.examination_centres(id,display_name) values
  ('c1600000-0000-4000-8000-000000000001','Metric Centre 1'),
  ('c1600000-0000-4000-8000-000000000002','Metric Centre 2'),
  ('c1600000-0000-4000-8000-000000000003','Metric Centre 3');
insert into public.school_examination_centre_assignments(id,tenant_id,school_id,examination_centre_id,effective_from,source_name,created_by_user_id) values
  ('c1610000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1600000-0000-4000-8000-000000000001','2020-01-01','metric fixture','c1000000-0000-4000-8000-000000000005'),
  ('c1610000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002','c1600000-0000-4000-8000-000000000002','2020-01-01','metric fixture','c1000000-0000-4000-8000-000000000005'),
  ('c1610000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','c1600000-0000-4000-8000-000000000003','2020-01-01','metric fixture','c1000000-0000-4000-8000-000000000005');

select is((select count(*)::integer from public.canonical_metric_registry where network_safe),9,'registry exposes exactly the original school count plus eight integrated network-safe metrics');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);

select is((select metric_value from public.network_canonical_metric_as_of('network.school_count','2026-04-01')),2::numeric,'school count reconciles to circuit A network assignments');
select is((select metric_value from public.network_canonical_metric_as_of('staffing.establishment_posts','2026-04-01')),3::numeric,'staffing establishment total reconciles to effective authoritative posts');
select is((select metric_value from public.network_canonical_metric_as_of('staffing.occupied_posts','2026-04-01')),1::numeric,'staffing occupied count reconciles to effective authoritative occupancies');
select is((select metric_value from public.network_canonical_metric_as_of('staffing.vacant_posts','2026-04-01')),2::numeric,'staffing vacant count is derived from establishment less occupied posts');
select is((select metric_value from public.network_canonical_metric_as_of('hostel.capacity','2026-04-01')),150::numeric,'hostel capacity reconciles to effective hostel capacity');
select is((select metric_value from public.network_canonical_metric_as_of('hostel.occupancy','2026-04-01')),2::numeric,'hostel occupancy reconciles to effective residencies');
select is((select metric_value from public.network_canonical_metric_as_of('feeding.beneficiaries_served','2026-04-01')),50::numeric,'feeding beneficiaries reconcile to service-day source counts');
select is((select metric_value from public.network_canonical_metric_as_of('feeding.meals_served','2026-04-01')),60::numeric,'feeding meals reconcile to service-day source counts');
select is((select metric_value from public.network_canonical_metric_as_of('examination.centre_count','2026-04-01')),2::numeric,'examination centre count reconciles to distinct effective school-centre assignments');
select is((select scoped_school_count from public.network_canonical_metric_as_of('hostel.capacity','2026-04-01')),2::bigint,'aggregate surface reports only coarse scoped-school count');
select ok(not ((select to_jsonb(r) from public.network_canonical_metric_as_of('staffing.occupied_posts','2026-04-01') r) ?| array['school_id','school_name','learner_id','learner_name','staff_member_id','employee_number']),'network aggregate row exposes no school, learner, or staff identity fields');
select is((select metric_value from public.network_canonical_metric_as_of('staffing.establishment_posts','2025-06-01')),4::numeric,'historical as-of reproduces effective-dated staffing facts while current authority remains active');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select is((select metric_value from public.network_canonical_metric_as_of('staffing.establishment_posts','2026-04-01')),5::numeric,'circuit B caller receives only circuit B facts and cannot cross network scope');
select is((select metric_value from public.network_canonical_metric_as_of('hostel.capacity','2026-04-01')),999::numeric,'cross-network hostel facts remain isolated to the caller authorized circuit');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
select throws_ok($$select * from public.network_canonical_metric_as_of('staffing.establishment_posts','2025-06-01')$$,'Permission denied','expired membership is denied even when p_as_of falls inside its historical membership period');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true);
select throws_ok($$select * from public.network_canonical_metric_as_of('hostel.capacity','2026-04-01')$$,'Permission denied','authenticated caller without current network authority is denied');

reset role;
insert into public.canonical_metric_registry(metric_key,display_name,description,unit,value_type,aggregation_method,source_domain,network_safe,effective_from)
values('network.private_fixture','Private fixture','Must never aggregate','rows','integer','count','test',false,'2020-01-01');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select throws_ok($$select * from public.network_canonical_metric_as_of('network.private_fixture','2026-04-01')$$,'Metric is not available for network aggregation','non-network-safe registry metadata is rejected');

reset role;
set local role anon;
select throws_ok($$select * from public.network_canonical_metric_as_of('network.school_count','2026-04-01')$$,'permission denied for function network_canonical_metric_as_of','anonymous callers cannot execute the aggregate surface');

reset role;
select * from finish();
rollback;
