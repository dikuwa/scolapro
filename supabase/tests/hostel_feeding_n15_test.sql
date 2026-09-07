begin;

select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd000000-0000-4000-8000-000000000001','n15-manager@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000002','n15-hod@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000003','n15-teacher@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000004','n15-other@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N15 Other School','N15-OTHER','Erongo','Walvis Bay','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000002','hod','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000003','teacher','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000004','school_admin','2026-01-01');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'8','Grade 8');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('fd300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N15','Resident Female','female'),
('fd300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N15','Resident Male','male');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status) values
('fd400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000001',2026,'fd200000-0000-4000-8000-000000000001','2026-01-10','current'),
('fd400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000002',2026,'fd200000-0000-4000-8000-000000000001','2026-01-10','current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.record_school_hostel('22222222-2222-4222-8222-222222222222','boarding',4,'2026-01-01','2026-01-10','2026-12-05','Monthly home weekends',3)$$,
  'school manager can create lean effective-dated hostel profile'
);

select lives_ok(
  $$select public.record_hostel_residency((select id from public.school_hostels where school_id='22222222-2222-4222-8222-222222222222'),'fd400000-0000-4000-8000-000000000001','2026-01-10',null)$$,
  'school manager can record residency using authoritative enrolment'
);

select lives_ok(
  $$select public.record_hostel_residency((select id from public.school_hostels where school_id='22222222-2222-4222-8222-222222222222'),'fd400000-0000-4000-8000-000000000002','2026-01-10',null)$$,
  'school manager can record second residency'
);

select is((select current_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),2,'hostel aggregate derives current resident count');
select is((select female_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),1,'hostel aggregate derives female residents from authoritative learner sex');
select is((select male_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),1,'hostel aggregate derives male residents from authoritative learner sex');
select is((select occupancy_percent from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),50.00::numeric,'hostel occupancy percentage derives from capacity and residencies');

select lives_ok(
  $$select public.create_feeding_programme('22222222-2222-4222-8222-222222222222','N15 School Feeding','government','2026-01-01','2026-12-31','Ministry',120)$$,
  'school manager can create lean feeding programme'
);

select lives_ok(
  $$select public.record_feeding_service_day((select id from public.school_feeding_programmes where programme_name='N15 School Feeding'),'2026-03-03',100,100,null,null)$$,
  'school manager can record normal serving day'
);

select lives_ok(
  $$select public.record_feeding_service_day((select id from public.school_feeding_programmes where programme_name='N15 School Feeding'),'2026-03-04',80,80,'Late delivery','Low maize meal')$$,
  'school manager can record interruptions and stock alerts'
);

select is((select serving_days from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')),2,'monthly feeding summary derives serving days');
select is((select total_meals from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')),180::bigint,'monthly feeding summary derives meal counts');
select is((select interruption_days from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')),1,'monthly feeding summary derives interruption days');
select is((select stock_alert_days from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')),1,'monthly feeding summary derives stock-alert days');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select is((select current_residents from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),2,'HOD can read safe hostel aggregate');
select is((select count(*)::integer from public.hostel_residencies),0,'HOD aggregate access does not expose named residency rows');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
select throws_ok($$select * from public.feeding_monthly_summary('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','ordinary teacher cannot read N15 management aggregates');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000004',true);
select throws_ok($$select * from public.hostel_occupancy_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,'Permission denied','other-school leadership cannot read N15 hostel aggregate');

select * from finish();
rollback;
