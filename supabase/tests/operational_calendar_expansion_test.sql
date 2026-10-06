begin;

select plan(24);

select has_table('public','academic_term_calendar_profiles','official term calendar metadata table exists');
select has_table('public','operational_calendar_events','operational school/department event table exists');
select has_view('public','effective_operational_calendar_events','effective operational event view exists');
select has_function('public','create_operational_calendar_event',array[
  'uuid','integer','text','text','text','date','date','time without time zone','time without time zone',
  'text','uuid','uuid','text','text','uuid','text','text','text','text','uuid','uuid','text'
]::name[],'governed operational event RPC exists');

select ok(
  not has_table_privilege('authenticated','public.operational_calendar_events','INSERT')
  and not has_table_privilege('authenticated','public.operational_calendar_events','UPDATE')
  and not has_table_privilege('authenticated','public.operational_calendar_events','DELETE'),
  'authenticated clients cannot bypass governed operational-calendar mutation'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','c1310000-0000-4000-8000-000000000001','authenticated','authenticated','calendar-principal@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','c1310000-0000-4000-8000-000000000002','authenticated','authenticated','calendar-hod@scolapro.invalid','',now(),now(),now());

insert into public.tenants(id,name,slug)
values('c1311000-0000-4000-8000-000000000001','Operational Calendar Tenant','operational-calendar-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('c1312000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','Operational Calendar School','OCAL-1','Erongo','Swakopmund','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('c1313000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000002','OC-HOD','Calendar','HOD','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('c1314000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000001',null,'principal',current_date-10),
  ('c1314000-0000-4000-8000-000000000002','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001','c1310000-0000-4000-8000-000000000002','c1313000-0000-4000-8000-000000000001','hod',current_date-10);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('c1315000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001','c1313000-0000-4000-8000-000000000001','management',current_date-10,'c1310000-0000-4000-8000-000000000001');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values('c1316000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001','OCBIO','Biology');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values('c1317000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001',2027,'setup','2027-01-11','2027-12-03');

insert into public.academic_terms(id,tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status)
values('c1318000-0000-4000-8000-000000000001','c1311000-0000-4000-8000-000000000001','c1312000-0000-4000-8000-000000000001','c1317000-0000-4000-8000-000000000001',1,'Term 1','2027-01-11','2027-01-15','setup');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1310000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.configure_academic_term_calendar_profile(
    'c1318000-0000-4000-8000-000000000001','2027-01-07','2027-01-18',5,
    'official_source','Published source','Source ref'
  )$$,
  'principal can store teacher dates and the published learner-day validation target'
);

select is(
  app_private.is_expected_school_day('c1312000-0000-4000-8000-000000000001','2027-01-08'),
  false,
  'weekday before learner term opening is not a register day'
);

select lives_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'school','meeting','Parent meeting',
    '2027-01-12','2027-01-12',null,null,'parents',null,null,null,'UNCHANGED'
  )$$,
  'principal can add informational school event without changing learner-day status'
);

select is(
  app_private.is_expected_school_day('c1312000-0000-4000-8000-000000000001','2027-01-12'),
  true,
  'ordinary school event leaves the normal learner register day open'
);

select lives_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'school','school_activity','School holiday',
    '2027-01-13','2027-01-13',null,null,'all_school',null,null,'Official closure','NO_TEACHING'
  )$$,
  'principal can explicitly mark a school event as no teaching'
);

select is(
  app_private.is_expected_school_day('c1312000-0000-4000-8000-000000000001','2027-01-13'),
  false,
  'explicit school holiday closes the learner register'
);

select is(
  (select calculated_learner_day_count
   from public.list_academic_term_calendar_summary('c1312000-0000-4000-8000-000000000001',2027)
   where term_number=1),
  4,
  'resolved term day count excludes the explicit closure rather than forcing the published total'
);

select lives_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'school','school_activity','Replacement Saturday',
    '2027-01-16','2027-01-16',null,null,'all_school',null,null,'Approved replacement day','SCHOOL_DAY'
  )$$,
  'principal can explicitly open a normally closed special school day'
);

select is(
  app_private.is_expected_school_day('c1312000-0000-4000-8000-000000000001','2027-01-16'),
  true,
  'explicit special-day override wins even outside the normal term/weekday baseline'
);

reset role;

insert into public.subject_department_responsibilities(
  tenant_id,school_id,subject_id,department_head_staff_assignment_id,department_label,effective_from,created_by_user_id
) values (
  'c1311000-0000-4000-8000-000000000001',
  'c1312000-0000-4000-8000-000000000001',
  'c1316000-0000-4000-8000-000000000001',
  'c1315000-0000-4000-8000-000000000001',
  'Science',
  current_date-1,
  'c1310000-0000-4000-8000-000000000001'
);

select pass('governed HOD portfolio fixture is configured for department calendar authority');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1310000-0000-4000-8000-000000000002',true);


select lives_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'department','deadline','CASS marks due',
    '2027-01-14','2027-01-14',null,null,'department_staff',
    'c1315000-0000-4000-8000-000000000001',null,'Submit verified CASS marks','UNCHANGED'
  )$$,
  'current HOD may create a compact department deadline inside the governed portfolio'
);

select throws_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'department','deadline','Invalid closure',
    '2027-01-14','2027-01-14',null,null,'department_staff',
    'c1315000-0000-4000-8000-000000000001',null,null,'NO_TEACHING'
  )$$,
  'Department events cannot change learner school-day status',
  'HOD department event cannot close the learner register'
);

select throws_ok(
  $$select public.create_operational_calendar_event(
    'c1312000-0000-4000-8000-000000000001',2027,'school','meeting','Unauthorized school event',
    '2027-01-14','2027-01-14'
  )$$,
  'Permission denied',
  'HOD portfolio authority does not grant school-wide calendar mutation'
);

select is(
  (select count(*)::integer
   from public.list_my_operational_calendar_events(
     'c1312000-0000-4000-8000-000000000001','2027-01-01','2027-01-31'
   )
   where title='CASS marks due'),
  1,
  'HOD upcoming feed includes governed department events'
);

select ok(
  pg_get_functiondef('public.commit_operational_intake_job(uuid)'::regprocedure)
    like '%calendar_target%'
  and pg_get_functiondef('public.commit_operational_intake_job(uuid)'::regprocedure)
    like '%create_operational_calendar_event%',
  'reviewed OCR-tagged calendar rows commit through governed operational-event creation'
);

reset role;

select is(
  (
    select sum(profile.official_learner_day_count)::integer
    from public.academic_term_calendar_profiles profile
    join public.academic_terms term on term.id=profile.academic_term_id
    join public.academic_years year on year.id=term.academic_year_id
    where profile.school_id='22222222-2222-4222-8222-222222222222'::uuid
      and year.year=2026
  ),
  199,
  'Namib High 2026 published learner-day validation total is source-backed at 199'
);

select is(
  (
    select profile.teacher_starts_on
    from public.academic_term_calendar_profiles profile
    join public.academic_terms term on term.id=profile.academic_term_id
    join public.academic_years year on year.id=term.academic_year_id
    where profile.school_id='22222222-2222-4222-8222-222222222222'::uuid
      and year.year=2026
      and term.term_number=3
  ),
  date '2026-09-03',
  'Namib High 2026 Term 3 teacher opening is stored separately from learner opening'
);

select is(
  app_private.is_expected_school_day(
    '22222222-2222-4222-8222-222222222222'::uuid,
    date '2026-10-05'
  ),
  false,
  'International Teacher''s Day school holiday closes the learner register'
);

select is(
  (
    select reason
    from public.school_day_overrides
    where school_id='22222222-2222-4222-8222-222222222222'::uuid
      and school_date=date '2026-10-05'
  ),
  'School Holiday - International Teacher''s Day',
  'school-day override retains the supplied official source meaning'
);

select * from finish();
rollback;
