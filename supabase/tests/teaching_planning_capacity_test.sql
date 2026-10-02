begin;

select plan(14);

select has_function(
  'public',
  'get_teaching_planning_capacity',
  array['uuid','integer','date'],
  'calendar-adjusted teaching planning capacity RPC exists'
);

select is(
  has_function_privilege(
    'anon',
    'public.get_teaching_planning_capacity(uuid,integer,date)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot read teaching planning capacity'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_teaching_planning_capacity(uuid,integer,date)',
    'EXECUTE'
  ),
  true,
  'authenticated planning users can invoke the guarded capacity read model'
);

insert into public.tenants(id,name,slug)
values(
  'f6200000-0000-4000-8000-000000000001',
  'Planning Capacity Tenant',
  'planning-capacity-tenant'
);

insert into public.schools(
  id,tenant_id,name,emis_number,region,town,timetable_cycle_mode,timetable_cycle_length
)
values(
  'f6210000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'Planning Capacity School',
  'PC-001',
  'Erongo',
  'Swakopmund',
  'rotating',
  3
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f6220000-0000-4000-8000-000000000001','capacity-platform@example.test','authenticated','authenticated',now(),now()),
  ('f6220000-0000-4000-8000-000000000002','capacity-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6220000-0000-4000-8000-000000000003','capacity-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'f6220000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

insert into public.academic_years(
  id,tenant_id,school_id,year,status,starts_on,ends_on
) values(
  'f6230000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,'active','2027-01-11','2027-01-22'
);

insert into public.academic_terms(
  id,tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status
) values(
  'f6240000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  'f6230000-0000-4000-8000-000000000001',
  1,'Term 1','2027-01-11','2027-01-22','active'
);

insert into public.school_day_overrides(
  id,tenant_id,school_id,school_date,is_school_day,reason,source
) values(
  'f6250000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  '2027-01-13',false,'Closure fixture','school'
);

insert into public.timetable_cycle_anchors(
  id,tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id
) values(
  'f6260000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,'2027-01-11',1,
  'f6220000-0000-4000-8000-000000000002'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  (
    'f6270000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000001',
    'f6210000-0000-4000-8000-000000000001',
    'f6220000-0000-4000-8000-000000000002',
    null,'school_admin',current_date-10
  );

insert into public.grades(
  id,tenant_id,school_id,academic_year,grade_code,display_name
) values(
  'f6280000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,'G9','Grade 9'
);

insert into public.register_classes(
  id,tenant_id,school_id,grade_id,academic_year,class_code,display_name
) values(
  'f6290000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  'f6280000-0000-4000-8000-000000000001',
  2027,'9A','9A'
);

insert into public.subjects(
  id,tenant_id,school_id,subject_code,display_name,status
) values(
  'f62a0000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  'PC-MATH','Planning Capacity Mathematics','active'
);

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,status
) values(
  'f62b0000-0000-4000-8000-000000000001',
  'NIED','planning-capacity-source','Planning Capacity Official Source',
  'https://example.test/planning-capacity.pdf','verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'f62c0000-0000-4000-8000-000000000001',
  'planning-capacity-math','Planning Capacity Mathematics',
  'junior_secondary','PCMATH','NIED',true
);

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,effective_to_year,status
) values(
  'f62d0000-0000-4000-8000-000000000001',
  'f62c0000-0000-4000-8000-000000000001',
  'planning-capacity-2027',
  'f62b0000-0000-4000-8000-000000000001',
  2027,2027,'imported'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6220000-0000-4000-8000-000000000001',true);
set local role authenticated;

update public.curriculum_versions
set status='published',
    approved_by_user_id='f6220000-0000-4000-8000-000000000001',
    approved_at=now()
where id='f62d0000-0000-4000-8000-000000000001';

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'f62e0000-0000-4000-8000-000000000001',
  'f62b0000-0000-4000-8000-000000000001',
  'planning-capacity-3day','Planning Capacity 3-day',
  'junior_secondary','rotating',3,40,24,2027,2027,'draft',
  '{"locator":"planning capacity fixture"}'::jsonb
);
update public.curriculum_time_profiles
set status='verified'
where id='f62e0000-0000-4000-8000-000000000001';
update public.curriculum_time_profiles
set status='published'
where id='f62e0000-0000-4000-8000-000000000001';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values(
  'f62f0000-0000-4000-8000-000000000001',
  'f62e0000-0000-4000-8000-000000000001',
  'f62c0000-0000-4000-8000-000000000001',
  'planning-capacity-g9','subject','Planning Capacity Mathematics',
  9,9,3,'prescribed','Planning Capacity Grade 9','draft'
);
update public.curriculum_time_allocations
set status='verified'
where id='f62f0000-0000-4000-8000-000000000001';
update public.curriculum_time_allocations
set status='published'
where id='f62f0000-0000-4000-8000-000000000001';

reset role;

insert into public.curriculum_units(
  id,curriculum_version_id,unit_code,topic,sequence_number,applicable_grade_keys
) values
  (
    'f6300000-0000-4000-8000-000000000001',
    'f62d0000-0000-4000-8000-000000000001',
    'PC-1','Completed planning unit',100,array['G9']
  ),
  (
    'f6300000-0000-4000-8000-000000000002',
    'f62d0000-0000-4000-8000-000000000001',
    'PC-2','Outstanding planning unit',200,array['G9']
  );

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status,curriculum_version_id
) values(
  'f6310000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,
  'f62a0000-0000-4000-8000-000000000001',
  'f6280000-0000-4000-8000-000000000001',
  3,'active',
  'f62d0000-0000-4000-8000-000000000001'
);

insert into public.staff_members(
  id,tenant_id,employee_number,first_name,last_name,status
) values(
  'f6320000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'PC-T1','Planning','Teacher','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'f6330000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  'f6320000-0000-4000-8000-000000000001',
  'teacher',current_date-10,'2027-12-31',
  'f6220000-0000-4000-8000-000000000002'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values(
  'f6270000-0000-4000-8000-000000000002',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  'f6220000-0000-4000-8000-000000000003',
  'f6320000-0000-4000-8000-000000000001',
  'teacher',current_date-10
);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
) values(
  'f6340000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,
  'f6310000-0000-4000-8000-000000000001',
  'f6290000-0000-4000-8000-000000000001',
  'f6320000-0000-4000-8000-000000000001',
  current_date-10,'2027-01-22'
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period
) values
  ('f6350000-0000-4000-8000-000000000001','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,1,'P1',true),
  ('f6350000-0000-4000-8000-000000000002','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,2,'P2',true),
  ('f6350000-0000-4000-8000-000000000003','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,3,'P3',true);

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status
) values
  ('f6360000-0000-4000-8000-000000000001','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,'R',1,'f6350000-0000-4000-8000-000000000001','f6290000-0000-4000-8000-000000000001','f6340000-0000-4000-8000-000000000001','active'),
  ('f6360000-0000-4000-8000-000000000002','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,'R',2,'f6350000-0000-4000-8000-000000000002','f6290000-0000-4000-8000-000000000001','f6340000-0000-4000-8000-000000000001','active'),
  ('f6360000-0000-4000-8000-000000000003','f6200000-0000-4000-8000-000000000001','f6210000-0000-4000-8000-000000000001',2027,'R',3,'f6350000-0000-4000-8000-000000000003','f6290000-0000-4000-8000-000000000001','f6340000-0000-4000-8000-000000000001','active');

select set_config('request.jwt.claim.sub','f6220000-0000-4000-8000-000000000002',true);
set local role authenticated;

insert into public.pacing_plans(
  id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,
  plan_level,teacher_allocation_id,status,created_by_user_id
) values(
  'f6370000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001',
  'f6210000-0000-4000-8000-000000000001',
  2027,
  'f6310000-0000-4000-8000-000000000001',
  'f62d0000-0000-4000-8000-000000000001',
  'department',
  'f6340000-0000-4000-8000-000000000001',
  'active',
  'f6220000-0000-4000-8000-000000000002'
);

insert into public.pacing_plan_items(
  id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,
  planned_start_on,planned_end_on,planned_periods,priority,sequence_number,
  academic_term_id,completed_on
) values
  (
    'f6380000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000001',
    'f6210000-0000-4000-8000-000000000001',
    'f6370000-0000-4000-8000-000000000001',
    'f6300000-0000-4000-8000-000000000001',
    '2027-01-11','2027-01-15',4,'normal',100,
    'f6240000-0000-4000-8000-000000000001',
    '2027-01-15'
  ),
  (
    'f6380000-0000-4000-8000-000000000002',
    'f6200000-0000-4000-8000-000000000001',
    'f6210000-0000-4000-8000-000000000001',
    'f6370000-0000-4000-8000-000000000001',
    'f6300000-0000-4000-8000-000000000002',
    '2027-01-18','2027-01-22',6,'normal',200,
    'f6240000-0000-4000-8000-000000000001',
    null
  );

select is(
  (
    select public.resolve_timetable_day(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-14'
    )
  ),
  3::smallint,
  'canonical resolver preserves the rotating sequence across the closure'
);

select is(
  (
    select year_expected_opportunities
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  9,
  'year capacity counts real calendar-adjusted timetable opportunities instead of periods-per-cycle times weeks'
);

select is(
  (
    select concat_ws(
      ':',
      year_planned_periods::text,
      year_remaining_capacity::text,
      future_expected_opportunities::text,
      outstanding_planned_periods::text,
      future_remaining_capacity::text
    )
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  '10:-1:5:6:-1',
  'planned and outstanding demand are compared with year and remaining real opportunities'
);

select is(
  (
    select concat_ws(
      ':',
      current_term_name,
      current_term_expected_opportunities::text,
      current_term_planned_periods::text,
      current_term_remaining_capacity::text
    )
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  'Term 1:9:10:-1',
  'current term capacity uses the same calendar-adjusted opportunity count'
);

select is(
  (
    select concat_ws(
      ':',
      official_resolution_status,
      official_periods_per_cycle::text,
      school_target_periods_per_cycle::text,
      cycle_kind,
      cycle_length::text
    )
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  'resolved:3:3:rotating:3',
  'capacity carries official and school cycle context without requiring teacher re-entry'
);

select is(
  (
    select term_capacity->0->>'expectedOpportunities'
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  '9',
  'term JSON preserves the expected calendar-adjusted opportunity count'
);

select is(
  (
    select capacity_status
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  'over_capacity',
  'planning demand exceeding year capacity is an exception state'
);

select ok(
  (
    select capacity_warnings @> jsonb_build_array(
      'Planned demand is 10 periods but only 9 calendar-adjusted teaching opportunities exist for the year.'
    )
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  'year capacity warning explains the exact shortage'
);

select ok(
  (
    select capacity_warnings @> jsonb_build_array(
      '6 planned periods remain but only 5 teaching opportunities remain from the as-of date.'
    )
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )
  ),
  'remaining-capacity warning explains the future shortage'
);

reset role;
select set_config('request.jwt.claim.sub','f6220000-0000-4000-8000-000000000003',true);
set local role authenticated;

select lives_ok(
  $$select *
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )$$,
  'allocated teacher can read planning capacity for their connected plan'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;

select throws_ok(
  $$select *
    from public.get_teaching_planning_capacity(
      'f6210000-0000-4000-8000-000000000001',
      2027,
      '2027-01-18'
    )$$,
  'Authentication required',
  'runtime auth gate fails closed'
);

select * from finish();
rollback;
