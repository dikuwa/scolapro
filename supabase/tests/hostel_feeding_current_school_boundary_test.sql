begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fa000000-0000-4000-8000-000000000001','n15-current-manager@example.test','authenticated','authenticated',now(),now()),
('fa000000-0000-4000-8000-000000000002','n15-stale-manager@example.test','authenticated','authenticated',now(),now()),
('fa000000-0000-4000-8000-000000000003','n15-platform-support@example.test','authenticated','authenticated',now(),now()),
('fa000000-0000-4000-8000-000000000004','n15-network@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fa100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N15 New Current School','N15-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin','2026-01-01');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000002','school_admin','2025-01-01','2026-01-31');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fa000000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.education_circuits(id,name,external_code)
values('fa200000-0000-4000-8000-000000000001','N15 Test Circuit','N15-C');
insert into public.education_network_memberships(user_id,role_key,circuit_id,active_from)
values('fa000000-0000-4000-8000-000000000004','circuit_officer','fa200000-0000-4000-8000-000000000001',current_date);

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('fa400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Resident','female'),
('fa400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Withdrawn','Resident','male');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status) values
('fa500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa400000-0000-4000-8000-000000000001',2026,(select id from public.grades where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and grade_code='8'),'2026-01-10','current'),
('fa500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa400000-0000-4000-8000-000000000002',2026,(select id from public.grades where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and grade_code='8'),'2026-01-10','withdrawn');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.record_school_hostel('22222222-2222-4222-8222-222222222222','boarding',20,'2026-01-01')$$,'current school manager can create hostel profile');
select lives_ok($$select public.record_hostel_residency((select id from public.school_hostels where school_id='22222222-2222-4222-8222-222222222222'),'fa500000-0000-4000-8000-000000000001','2026-01-10',null)$$,'current enrolment can be assigned to hostel');
select throws_ok($$select public.record_hostel_residency((select id from public.school_hostels where school_id='22222222-2222-4222-8222-222222222222'),'fa500000-0000-4000-8000-000000000002','2026-01-10',null)$$,'Hostel residency requires a current enrolment','non-current enrolment cannot receive a new hostel placement');
select lives_ok($$select public.create_feeding_programme('22222222-2222-4222-8222-222222222222','N15 Boundary Feeding','government','2026-01-01','2026-12-31')$$,'current school manager can create feeding programme');
select lives_ok($$select public.record_feeding_service_day((select id from public.school_feeding_programmes where programme_name='N15 Boundary Feeding'),'2026-03-01',10,10)$$,'current school manager can record feeding service day');
select is((select count(*)::integer from public.audit_events where actor_user_id='fa000000-0000-4000-8000-000000000001' and event_type in ('hostel.profile.created','hostel.residency.recorded','feeding.programme.created','feeding.service_day.recorded')),4,'N15 mutations preserve actor provenance');
select is(has_table_privilege('authenticated','public.hostel_residencies','UPDATE'),false,'authenticated clients cannot update audited hostel residency rows directly');

reset role;
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','school_admin','2026-02-01');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.school_hostels where school_id='22222222-2222-4222-8222-222222222222'),0,'older still-active school is hidden once another membership is deterministic current school');
select throws_ok($$select * from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','summary cannot borrow authority from older active non-current school');
select lives_ok($$select public.record_school_hostel('fa100000-0000-4000-8000-000000000002','boarding',15,'2026-02-01')$$,'manager retains N15 authority in deterministic current school');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','expired staff placement cannot read N15 operational summary');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
select throws_ok($$select * from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','platform support does not inherit school N15 authority');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);
select throws_ok($$select * from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','network officer does not inherit school N15 authority');

select * from finish();
rollback;