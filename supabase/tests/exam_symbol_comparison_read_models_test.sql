begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('c2100000-0000-4000-8000-000000000001','n21-leader@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000002','n21-assigned@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000003','n21-unassigned@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000004','n21-librarian@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000005','n21-finance@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000006','n21-counsellor@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000007','n21-support@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000008','n21-cross-school@example.test','authenticated','authenticated',now(),now()),
  ('c2100000-0000-4000-8000-000000000009','n21-network@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('c2110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000002','N21-A','Assigned','Teacher','active'),
  ('c2110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000003','N21-U','Unassigned','Teacher','active'),
  ('c2110000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000004','N21-L','Library','Staff','active'),
  ('c2110000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000005','N21-F','Finance','Staff','active'),
  ('c2110000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000006','N21-C','Counselling','Staff','active'),
  ('c2110000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','c2100000-0000-4000-8000-000000000007','N21-S','Support','Staff','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000001',null,'hod',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000002','c2110000-0000-4000-8000-000000000002','teacher',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000003','c2110000-0000-4000-8000-000000000003','teacher',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000004','c2110000-0000-4000-8000-000000000004','librarian',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000005','c2110000-0000-4000-8000-000000000005','finance',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000006','c2110000-0000-4000-8000-000000000006','counsellor',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2100000-0000-4000-8000-000000000007','c2110000-0000-4000-8000-000000000007','support',current_date-10);

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('c2120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N21 Other School','N21-OTHER','Erongo','Walvis Bay','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','c2120000-0000-4000-8000-000000000001','c2100000-0000-4000-8000-000000000008','school_admin',current_date-10);

insert into public.education_authorities(id,name) values('c2130000-0000-4000-8000-000000000001','N21 Authority');
insert into public.education_regions(id,name) values('c2130000-0000-4000-8000-000000000002','N21 Region');
insert into public.education_circuits(id,name) values('c2130000-0000-4000-8000-000000000003','N21 Circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('c2130000-0000-4000-8000-000000000004','c2130000-0000-4000-8000-000000000002','c2130000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('c2130000-0000-4000-8000-000000000005','c2130000-0000-4000-8000-000000000003','c2130000-0000-4000-8000-000000000002','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('c2130000-0000-4000-8000-000000000006','22222222-2222-4222-8222-222222222222','c2130000-0000-4000-8000-000000000001','c2130000-0000-4000-8000-000000000002','c2130000-0000-4000-8000-000000000003','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('c2130000-0000-4000-8000-000000000007','c2100000-0000-4000-8000-000000000009','circuit_officer','c2130000-0000-4000-8000-000000000003','2026-01-01');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('c2140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2025,'10','Grade 10');
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('c2140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','c2140000-0000-4000-8000-000000000001',2025,'10A-25','Grade 10/A 2025');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,enrolled_to)
values('c2140000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2025,'c2140000-0000-4000-8000-000000000001','c2140000-0000-4000-8000-000000000002','DEMO-001','2025-01-10','2025-12-10');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('c2150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','N21-MATH','N21 Mathematics','active'),
  ('c2150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','N21-SCI','N21 Science','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('c2160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2025,'c2150000-0000-4000-8000-000000000001','c2140000-0000-4000-8000-000000000001',5,'active'),
  ('c2160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'c2150000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('c2160000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'c2150000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active'),
  ('c2160000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'c2150000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011',5,'active');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('c2170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'c2160000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','c2110000-0000-4000-8000-000000000002',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000001',true);

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,symbol,assessment_scheme_key,assessment_scheme_version,
  academic_rule_set_key,academic_rule_set_version,calculation_snapshot,approved_by_user_id
) values
  ('c2180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2025,'c2140000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000001',1,68,'C','N21','v1','RULE','v1','{}','c2100000-0000-4000-8000-000000000001'),
  ('c2180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000002',1,72,'B','N21','v1','RULE','v1','{}','c2100000-0000-4000-8000-000000000001'),
  ('c2180000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000002',2,73,'B','N21','v2','RULE','v1','{}','c2100000-0000-4000-8000-000000000001');

set local role authenticated;
select lives_ok(
  $$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,null,null)$$,
  'academic leadership may read school-wide official-result aggregates'
);
select is(
  (select count(*)::integer from public.compare_official_result_series(
    '22222222-2222-4222-8222-222222222222',
    'c2160000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000002',
    2025,1::smallint,2026,1::smallint
  )),
  2,
  'true cross-year comparison succeeds with distinct compatible annual subject offerings'
);
select throws_ok(
  $$select * from public.compare_official_result_series(
    '22222222-2222-4222-8222-222222222222',
    'c2160000-0000-4000-8000-000000000002','c2160000-0000-4000-8000-000000000002',
    2025,1::smallint,2026,1::smallint
  )$$,
  'Distinct academic years require distinct annual subject offerings',
  'same annual subject offering cannot be reused across academic years'
);
select throws_ok(
  $$select * from public.compare_official_result_series(
    '22222222-2222-4222-8222-222222222222',
    'c2160000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000003',
    2025,1::smallint,2026,1::smallint
  )$$,
  'Incompatible subject offerings: subject differs',
  'cross-year comparison rejects incompatible subjects'
);
select throws_ok(
  $$select * from public.compare_official_result_series(
    '22222222-2222-4222-8222-222222222222',
    'c2160000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000004',
    2025,1::smallint,2026,1::smallint
  )$$,
  'Incompatible subject offerings: grade differs',
  'cross-year comparison rejects incompatible grade context'
);
select throws_ok(
  $$select * from public.compare_official_result_series(
    '22222222-2222-4222-8222-222222222222',
    'c2160000-0000-4000-8000-000000000001','c2160000-0000-4000-8000-000000000002',
    2025,1::smallint,2026,2::smallint
  )$$,
  'Incompatible result series provenance',
  'cross-year comparison preserves captured provenance compatibility checks'
);
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$select * from public.get_official_result_symbol_distribution(
    '22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002'
  )$$,
  'assigned teacher may read aggregate results for the exact allocated offering/class scope'
);
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,
  'Permission denied','unassigned teacher is denied official-result aggregates'
);
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','librarian is denied academic result aggregates');
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','finance membership is denied academic result aggregates');
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','counsellor is denied academic result aggregates');
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000007',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','support membership is denied academic result aggregates');
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000008',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','academic leader at another school is denied cross-school aggregates');
reset role;

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000009',true);
set local role authenticated;
select throws_ok($$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,'Permission denied','network-only role cannot use school academic result aggregate RPC');
reset role;

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_like(
  $$select * from public.get_official_result_symbol_distribution('22222222-2222-4222-8222-222222222222',2026,1::smallint,'c2160000-0000-4000-8000-000000000002')$$,
  '%permission denied for function get_official_result_symbol_distribution%',
  'anon cannot execute official-result aggregate RPC'
);
reset role;

select * from finish();
rollback;