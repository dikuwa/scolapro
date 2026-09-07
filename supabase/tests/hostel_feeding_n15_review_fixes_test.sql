begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe000000-0000-4000-8000-000000000001','n15-fix-manager@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000002','n15-fix-teacher@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000003','n15-fix-other@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N15 Fix Other School','N15-FIX-OTHER','Erongo','Walvis Bay','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','teacher','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fe100000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000003','school_admin','2026-01-01');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('fe300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N15','Closure Learner','female'),
('fe300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N15','Denial Learner','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status) values
('fe400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe300000-0000-4000-8000-000000000001',2026,(select id from public.grades where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and grade_code='8'),'2026-01-10','current'),
('fe400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe300000-0000-4000-8000-000000000002',2026,(select id from public.grades where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and grade_code='8'),'2026-01-10','current');

-- Fixed open residency used for denial tests so RLS on the table cannot hide the
-- target id before the governed RPC performs its own authorization check.
insert into public.school_hostels(id,tenant_id,school_id,hostel_type,capacity,active_from,created_by_user_id)
values('fe500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','other',5,'2026-01-01','fe000000-0000-4000-8000-000000000001');
insert into public.hostel_residencies(id,tenant_id,school_id,hostel_id,enrolment_id,resident_from,created_by_user_id)
values('fe600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe500000-0000-4000-8000-000000000001','fe400000-0000-4000-8000-000000000002','2026-01-10','fe000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.record_school_hostel('22222222-2222-4222-8222-222222222222','boarding',20,'2026-01-01',null,null,null,2)$$,'manager creates active hostel');
select lives_ok($$select public.record_hostel_residency((select id from public.school_hostels where created_by_user_id='fe000000-0000-4000-8000-000000000001' and id<>'fe500000-0000-4000-8000-000000000001' order by created_at desc limit 1),'fe400000-0000-4000-8000-000000000001','2026-01-10',null)$$,'manager records open residency');

select is((select current_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-02-01') where capacity=20),1,'pre-closure history shows learner resident');
select lives_ok($$select public.end_hostel_residency((select id from public.hostel_residencies where enrolment_id='fe400000-0000-4000-8000-000000000001'),'2026-02-15')$$,'authorized management can close open residency');
select is((select resident_to from public.hostel_residencies where enrolment_id='fe400000-0000-4000-8000-000000000001'),'2026-02-15'::date,'closure preserves historical end date');
select is((select current_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-02-01') where capacity=20),1,'history remains reproducible before residency end');
select is((select current_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01') where capacity=20),0,'post-closure occupancy excludes ended residency');
select is((select count(*)::integer from public.audit_events where entity_type='hostel_residency' and event_type='hostel.residency.ended' and metadata->>'resident_to'='2026-02-15'),1,'closure emits audit event');

select lives_ok($$select public.record_school_hostel('22222222-2222-4222-8222-222222222222','weekly_boarding',10,'2026-03-01',null,null,null,1)$$,'manager creates second empty hostel');
select ok(exists(select 1 from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-10') where capacity=10 and current_residents=0 and female_residents=0 and male_residents=0 and other_or_unspecified_residents=0),'empty hostel sex counts reconcile to zero');

select lives_ok($$select public.create_feeding_programme('22222222-2222-4222-8222-222222222222','N15 Fix Feeding A','government','2026-01-01','2026-12-31',null,null)$$,'create first feeding programme');
select lives_ok($$select public.create_feeding_programme('22222222-2222-4222-8222-222222222222','N15 Fix Feeding B','donor','2026-01-01','2026-12-31',null,null)$$,'create second feeding programme');
select lives_ok($$select public.record_feeding_service_day((select id from public.school_feeding_programmes where programme_name='N15 Fix Feeding A'),'2026-04-07',50,50,'Delivery delay','Low stock')$$,'record first same-date feeding row');
select lives_ok($$select public.record_feeding_service_day((select id from public.school_feeding_programmes where programme_name='N15 Fix Feeding B'),'2026-04-07',40,40,'Delivery delay','Low stock')$$,'record second same-date feeding row');
select ok((select serving_days=1 and interruption_days=1 and stock_alert_days=1 from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-04-01')),'same service date counts once for school-wide serving/interruption/stock-alert days');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.end_hostel_residency('fe600000-0000-4000-8000-000000000001','2026-02-15')$$,'Permission denied','unauthorized teacher cannot close residency');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.end_hostel_residency('fe600000-0000-4000-8000-000000000001','2026-02-15')$$,'Permission denied','cross-school management cannot close residency');

select * from finish();
rollback;
