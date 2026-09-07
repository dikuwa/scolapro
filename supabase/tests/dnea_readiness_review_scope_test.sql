begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('da000000-0000-4000-8000-000000000001','dnea-network@example.test','authenticated','authenticated',now(),now()),
 ('da000000-0000-4000-8000-000000000002','dnea-school@example.test','authenticated','authenticated',now(),now()),
 ('da000000-0000-4000-8000-000000000003','dnea-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','da000000-0000-4000-8000-000000000002','exam_officer','2026-01-01');

insert into public.education_authorities(id,name) values('da100000-0000-4000-8000-000000000001','DNEA readiness authority');
insert into public.education_regions(id,name) values('da110000-0000-4000-8000-000000000001','DNEA readiness region');
insert into public.education_circuits(id,name) values('da120000-0000-4000-8000-000000000001','DNEA readiness circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('da200000-0000-4000-8000-000000000001','da110000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('da210000-0000-4000-8000-000000000001','da120000-0000-4000-8000-000000000001','da110000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('da300000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','da100000-0000-4000-8000-000000000001','da110000-0000-4000-8000-000000000001','da120000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('da310000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','circuit_officer','da120000-0000-4000-8000-000000000001','2026-01-01');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values('da400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'N08-TEST','N08 readiness test');
insert into public.examination_candidates(id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
values('da410000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','da400000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002');
insert into public.examination_readiness_issues(id,tenant_id,school_id,examination_cycle_id,candidate_id,issue_code,severity,message)
values('da420000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','da400000-0000-4000-8000-000000000001','da410000-0000-4000-8000-000000000001','candidate_number_missing','blocking','Official Candidate Number has not been assigned.');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select access_scope from public.list_dnea_readiness_scope('2026-09-07') where examination_cycle_id='da400000-0000-4000-8000-000000000001'),'network','circuit reviewer receives aggregate readiness scope');
select is((select blocking_count::integer from public.list_dnea_readiness_scope('2026-09-07') where examination_cycle_id='da400000-0000-4000-8000-000000000001'),1,'network readiness summary exposes blocking exception count');
select throws_ok($$select * from public.get_dnea_candidate_readiness('da400000-0000-4000-8000-000000000001')$$,'Permission denied','network membership alone cannot read candidate readiness identity detail');
select is((select count(*)::integer from public.learners where id='50000000-0000-4000-8000-000000000001'),0,'network readiness permission does not broaden direct learner RLS');
reset role;

select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.get_dnea_candidate_readiness('da400000-0000-4000-8000-000000000001')),1,'school examination officer can review candidate readiness detail');
reset role;

select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.list_dnea_readiness_scope('2026-09-07') where examination_cycle_id='da400000-0000-4000-8000-000000000001'),0,'unscoped user cannot see school readiness summary');
reset role;

select * from finish();
rollback;
