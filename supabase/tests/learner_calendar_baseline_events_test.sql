begin;

select plan(28);

select has_table('public','learner_calendar_events','learner calendar event table exists');
select has_view('public','effective_learner_calendar_events','effective learner calendar view exists');
select ok(
  not has_table_privilege('authenticated','public.learner_calendar_events','INSERT')
  and not has_table_privilege('authenticated','public.learner_calendar_events','UPDATE')
  and not has_table_privilege('authenticated','public.learner_calendar_events','DELETE'),
  'authenticated clients cannot bypass governed event mutations'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000001','authenticated','authenticated','calendar-platform@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000002','authenticated','authenticated','calendar-a@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000003','authenticated','authenticated','calendar-c@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000004','authenticated','authenticated','calendar-b@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000005','authenticated','authenticated','calendar-stale@scolapro.invalid','',now(),now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('ca000000-0000-4000-8000-000000000001','platform_admin',current_date-1);

insert into public.tenants(id,name,slug) values
  ('ca100000-0000-4000-8000-000000000001','Calendar Tenant A','calendar-tenant-a'),
  ('ca100000-0000-4000-8000-000000000002','Calendar Tenant B','calendar-tenant-b');
insert into public.schools(id,tenant_id,name,emis_number,region,town) values
  ('ca200000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','Calendar School A','CAL-A','Khomas','Windhoek'),
  ('ca200000-0000-4000-8000-000000000002','ca100000-0000-4000-8000-000000000001','Calendar School C','CAL-C','Khomas','Windhoek'),
  ('ca200000-0000-4000-8000-000000000003','ca100000-0000-4000-8000-000000000002','Calendar School B','CAL-B','Erongo','Walvis Bay');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to) values
  ('ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','principal',current_date-1,null),
  ('ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000003','principal',current_date-1,null),
  ('ca100000-0000-4000-8000-000000000002','ca200000-0000-4000-8000-000000000003','ca000000-0000-4000-8000-000000000004','principal',current_date-1,null),
  ('ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000005','principal',current_date-10,current_date-1);
insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on) values
  ('ca300000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',2027,'setup','2027-01-11','2027-12-03'),
  ('ca300000-0000-4000-8000-000000000002','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000002',2027,'setup','2027-01-11','2027-12-03'),
  ('ca300000-0000-4000-8000-000000000003','ca100000-0000-4000-8000-000000000002','ca200000-0000-4000-8000-000000000003',2027,'setup','2027-01-11','2027-12-03'),
  ('ca300000-0000-4000-8000-000000000004','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',2025,'setup','2025-01-13','2025-12-05');

update public.schools set timetable_cycle_mode='rotating',timetable_cycle_length=5
where id='ca200000-0000-4000-8000-000000000001';
insert into public.timetable_cycle_anchors(id,tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id)
values('ca400000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',2027,'2027-01-11',1,'ca000000-0000-4000-8000-000000000002');
insert into public.timetable_bell_schedules(id,tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id)
values('ca500000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',2027,'Exam bells','2027-01-11','2027-12-03',array[1,2,3,4,5]::smallint[],'ca000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.create_national_learner_calendar_event(2027,'Reading day','Information','2027-01-12','2027-01-12',null,null,'National reading programme','NORMAL')$$,
  'current platform admin may create national learner baseline events'
);

select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000002',true);
select is(
  public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-12'),
  'NORMAL','informational event remains NORMAL'
);
select lives_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2027,'One-day holiday','Holiday','2027-01-13','2027-01-13',null,null,'all_learners',null,'School holiday','NO_TEACHING')$$,
  'current school principal may create a school learner event'
);
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-12'),'NORMAL','day before one-day holiday remains teaching');
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-13'),'NO_TEACHING','holiday date resolves no teaching');
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-14'),'NORMAL','day after one-day holiday remains teaching');
select is(app_private.is_expected_school_day('ca200000-0000-4000-8000-000000000001','2027-01-13'),false,'learner attendance excludes event NO_TEACHING dates');
select is(public.resolve_timetable_day('ca200000-0000-4000-8000-000000000001',2027,'2027-01-14'),3::smallint,'rotating cycle skips event NO_TEACHING date');

select lives_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2027,'Short day','School programme','2027-01-15','2027-01-15','08:00','12:00','all_learners',null,null,'PARTIAL_DAY')$$,
  'partial-day event is accepted distinctly'
);
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-15'),'PARTIAL_DAY','partial day remains distinct');
select lives_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2027,'Examinations','Assessment','2027-01-18','2027-01-18',null,null,'all_learners',null,null,'EXAM_TIMETABLE','ca500000-0000-4000-8000-000000000001')$$,
  'exam event accepts an alternate bell schedule'
);
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-18'),'EXAM_TIMETABLE','exam timetable remains distinct');
select is(public.resolve_timetable_bell_schedule('ca200000-0000-4000-8000-000000000001',2027,'2027-01-18')::text,'ca500000-0000-4000-8000-000000000001','event alternate bell schedule resolves');
select lives_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2027,'Changed programme','Timetable','2027-01-19','2027-01-19',null,null,'all_learners',null,null,'ALTERED_TIMETABLE','ca500000-0000-4000-8000-000000000001')$$,
  'altered-timetable event is accepted distinctly'
);
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000001','2027-01-19'),'ALTERED_TIMETABLE','altered timetable remains distinct');

select throws_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000002',2027,'Wrong school','Information','2027-02-01','2027-02-01')$$,
  'Permission denied','cross-school mutation is denied'
);
select throws_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000003',2027,'Wrong tenant','Information','2027-02-01','2027-02-01')$$,
  'Permission denied','cross-tenant mutation is denied'
);
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2027,'Stale authority','Information','2027-02-01','2027-02-01')$$,
  'Permission denied','stale school authority is denied'
);

select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.effective_learner_calendar_events where event_scope='school' and school_id='ca200000-0000-4000-8000-000000000001'),
  0,'cross-tenant event rows are hidden by RLS'
);
select is(
  (select count(*)::integer from public.effective_learner_calendar_events where event_scope='national' and title='Reading day'),
  1,'national learner baseline remains visible to authenticated school users'
);

select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.create_national_learner_calendar_event(2027,'National holiday','Public holiday','2027-02-03','2027-02-03',null,null,null,'NO_TEACHING')$$,
  'platform admin may add a national no-teaching baseline date'
);
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000004',true);
select is(public.resolve_school_teaching_impact('ca200000-0000-4000-8000-000000000003','2027-02-03'),'NO_TEACHING','national baseline applies without per-school duplication');

reset role;
insert into public.learner_calendar_events(
  id,event_scope,tenant_id,school_id,academic_year,title,category,starts_on,ends_on,
  audience_scope,teaching_impact,created_by_user_id
) values (
  'ca600000-0000-4000-8000-000000000001','school','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',
  2025,'Historical event','Information','2025-03-03','2025-03-03','all_learners','NORMAL','ca000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.create_school_learner_calendar_event('ca200000-0000-4000-8000-000000000001',2025,'Rewritten history','Information','2025-03-03','2025-03-03',null,null,'all_learners',null,null,'NORMAL',null,'ca600000-0000-4000-8000-000000000001')$$,
  'Historical calendar events are final','historical event periods cannot be rewritten by revisions'
);
select is(
  (select count(*)::integer from public.audit_events where school_id='ca200000-0000-4000-8000-000000000001' and event_type='calendar.learner_event.created'),
  4,'school event mutations retain audit history'
);
select throws_ok(
  $$insert into public.learner_calendar_events(event_scope,tenant_id,school_id,academic_year,title,category,starts_on,ends_on,created_by_user_id)
    values('school','ca100000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',2027,'Bypass','Information','2027-03-01','2027-03-01','ca000000-0000-4000-8000-000000000002')$$,
  '42501',null,'authenticated direct event writes remain denied'
);

select * from finish();
rollback;
