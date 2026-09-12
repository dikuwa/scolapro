begin;

select plan(23);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fb000000-0000-4000-8000-000000000001','calendar-current-manager@example.test','authenticated','authenticated',now(),now()),
('fb000000-0000-4000-8000-000000000002','calendar-platform-support@example.test','authenticated','authenticated',now(),now()),
('fb000000-0000-4000-8000-000000000003','calendar-network@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Calendar New Current School','CAL-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fb000000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.education_circuits(id,name,external_code)
values('fb200000-0000-4000-8000-000000000001','Calendar Audit Circuit','CAL-C');
insert into public.education_network_memberships(user_id,role_key,circuit_id,active_from)
values('fb000000-0000-4000-8000-000000000003','circuit_officer','fb200000-0000-4000-8000-000000000001',current_date);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.configure_academic_year('22222222-2222-4222-8222-222222222222',2198,'2198-01-10','2198-12-10')$$,
  'leadership can configure the deterministic current school academic year'
);
select lives_ok(
  $$select public.configure_academic_term((select id from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198),1::smallint,'Term 1','2198-01-10','2198-04-10')$$,
  'leadership can configure the deterministic current school academic term'
);
select lives_ok(
  $$select public.update_school_timetable_cycle('22222222-2222-4222-8222-222222222222','rotating',5::smallint)$$,
  'leadership can configure the deterministic current school timetable cycle'
);
select lives_ok(
  $$select public.upsert_timetable_bell_schedule('22222222-2222-4222-8222-222222222222',2198,'Calendar audit bell','2198-01-10','2198-12-10')$$,
  'leadership can configure a bell schedule for the deterministic current school'
);
select lives_ok(
  $$select public.configure_school_teaching_day('22222222-2222-4222-8222-222222222222','2198-02-02','NORMAL','Calendar audit',null,'school')$$,
  'leadership can configure a school day for the deterministic current school'
);

reset role;
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','school_admin','2026-02-01');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.configure_academic_year('22222222-2222-4222-8222-222222222222',2198,'2198-01-11','2198-12-11')$$,
  'Permission denied',
  'older active non-current school cannot be targeted through academic-year RPC'
);
select throws_ok(
  $$select public.configure_academic_term((select id from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198),1::smallint,'Changed term','2198-01-11','2198-04-11')$$,
  'Permission denied',
  'older active non-current school cannot be targeted through academic-term RPC'
);
select throws_ok(
  $$select public.activate_academic_year((select id from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198))$$,
  'Permission denied',
  'older active non-current school cannot be activated directly'
);
select throws_ok(
  $$select public.close_academic_year((select id from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198))$$,
  'Permission denied',
  'older active non-current school cannot be closed directly'
);
select throws_ok(
  $$select public.update_school_timetable_cycle('22222222-2222-4222-8222-222222222222','weekday',5::smallint)$$,
  'Permission denied',
  'older active non-current school cannot be targeted through timetable-cycle RPC'
);
select throws_ok(
  $$select public.upsert_timetable_bell_schedule('22222222-2222-4222-8222-222222222222',2198,'Denied bell','2198-01-10','2198-12-10')$$,
  'Permission denied',
  'older active non-current school cannot be targeted through bell-schedule RPC'
);
select throws_ok(
  $$select public.upsert_timetable_bell_schedule_period((select id from public.timetable_bell_schedules where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2198 order by created_at desc limit 1),'fb300000-0000-4000-8000-000000000001',null,null)$$,
  'Permission denied',
  'bell-period mutation cannot borrow authority from an older active non-current school'
);
select throws_ok(
  $$select public.configure_school_teaching_day('22222222-2222-4222-8222-222222222222','2198-02-03','NORMAL','Denied calendar day',null,'school')$$,
  'Permission denied',
  'older active non-current school cannot be targeted through school-day RPC'
);
select throws_ok(
  $$select public.configure_timetable_cycle_anchor('22222222-2222-4222-8222-222222222222',2198,'2198-02-04',1::smallint)$$,
  'Permission denied',
  'older active non-current school cannot be targeted through timetable-anchor RPC'
);

select lives_ok(
  $$select public.configure_academic_year('fb100000-0000-4000-8000-000000000001',2199,'2199-01-10','2199-12-10')$$,
  'manager retains academic-year authority in deterministic current school'
);
select lives_ok(
  $$select public.configure_academic_term((select id from public.academic_years where school_id='fb100000-0000-4000-8000-000000000001' and year=2199),1::smallint,'Term 1','2199-01-10','2199-04-10')$$,
  'manager retains academic-term authority in deterministic current school'
);

reset role;
update public.academic_terms
set status='closed'
where academic_year_id=(select id from public.academic_years where school_id='fb100000-0000-4000-8000-000000000001' and year=2199)
  and term_number=1;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.configure_academic_term((select id from public.academic_years where school_id='fb100000-0000-4000-8000-000000000001' and year=2199),1::smallint,'Reopened term','2199-01-11','2199-04-11')$$,
  'Closed academic term is final',
  'closed academic term cannot be rewritten through configure RPC'
);

reset role;
update public.academic_years
set status='closed'
where school_id='fb100000-0000-4000-8000-000000000001' and year=2199;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.configure_academic_year('fb100000-0000-4000-8000-000000000001',2199,'2199-01-11','2199-12-11')$$,
  'Closed academic year is final',
  'closed academic year cannot be rewritten through configure RPC'
);
select throws_ok(
  $$select public.configure_academic_term((select id from public.academic_years where school_id='fb100000-0000-4000-8000-000000000001' and year=2199),2::smallint,'Term 2','2199-05-01','2199-08-01')$$,
  'Closed academic year is final',
  'closed academic year cannot receive new term configuration'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.configure_school_teaching_day('fb100000-0000-4000-8000-000000000001','2199-02-03','NORMAL','Support denied',null,'school')$$,
  'Permission denied',
  'platform_support cannot mutate school-local calendar state'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.configure_school_teaching_day('fb100000-0000-4000-8000-000000000001','2199-02-04','NORMAL','Network denied',null,'school')$$,
  'Permission denied',
  'network officer cannot mutate school-local calendar state'
);

reset role;
select is(
  (select count(*)::integer from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198 and starts_on='2198-01-10'),
  1,
  'denied non-current academic-year mutation leaves existing record unchanged'
);
select is(
  (select count(*)::integer from public.academic_terms where school_id='22222222-2222-4222-8222-222222222222' and academic_year_id=(select id from public.academic_years where school_id='22222222-2222-4222-8222-222222222222' and year=2198) and term_number=1 and display_name='Term 1'),
  1,
  'denied non-current academic-term mutation leaves existing record unchanged'
);

select * from finish();
rollback;
