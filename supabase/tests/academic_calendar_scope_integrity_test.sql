begin;

select plan(13);

insert into public.tenants(id,name,slug)
values('fc100000-0000-4000-8000-000000000001','Calendar Scope Tenant B','calendar-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fc110000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','Calendar Scope School B','CAL-SCOPE-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.academic_years(tenant_id,school_id,year,status)
    values('fc100000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2198,'setup')$$,
  'Academic year scope mismatch: school does not belong to tenant',
  'academic year tenant must match school tenant'
);

select lives_ok(
  $$insert into public.academic_years(id,tenant_id,school_id,year,status)
    values('fc120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2198,'setup')$$,
  'valid same-school academic year remains allowed'
);

select throws_ok(
  $$insert into public.academic_terms(tenant_id,school_id,academic_year_id,term_number,display_name,status)
    values('fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001','fc120000-0000-4000-8000-000000000001',1,'Term 1','setup')$$,
  'Academic term scope mismatch: academic year does not belong to school',
  'academic term cannot bind an academic year from another school'
);

select lives_ok(
  $$insert into public.academic_terms(id,tenant_id,school_id,academic_year_id,term_number,display_name,status)
    values('fc130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc120000-0000-4000-8000-000000000001',1,'Term 1','setup')$$,
  'valid same-school academic term remains allowed'
);

select throws_ok(
  $$insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,source)
    values('fc100000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','2198-01-15',false,'school')$$,
  'School-day override scope mismatch: school does not belong to tenant',
  'school-day override tenant must match school tenant'
);

select lives_ok(
  $$insert into public.school_day_overrides(id,tenant_id,school_id,school_date,is_school_day,source)
    values('fc140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2198-01-15',false,'school')$$,
  'valid school-day override remains allowed'
);

select throws_ok(
  $$insert into public.timetable_periods(tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period)
    values('fc100000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2198,29,'Period 29',true)$$,
  'Timetable period scope mismatch: school does not belong to tenant',
  'timetable period tenant must match school tenant'
);

select lives_ok(
  $$insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period)
    values('fc150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2198,29,'Period 29',true)$$,
  'valid timetable period remains allowed'
);

select throws_ok(
  $$update public.academic_years set year=2199 where id='fc120000-0000-4000-8000-000000000001'$$,
  'Academic year tenant, school, and year are immutable',
  'academic year identity cannot be moved after creation'
);

select throws_ok(
  $$update public.academic_terms set term_number=2 where id='fc130000-0000-4000-8000-000000000001'$$,
  'Academic term tenant, school, year, and term number are immutable',
  'academic term identity cannot be moved after creation'
);

select throws_ok(
  $$update public.school_day_overrides set school_date='2198-01-16' where id='fc140000-0000-4000-8000-000000000001'$$,
  'School-day override tenant, school, and date are immutable',
  'school-day override identity cannot be moved after creation'
);

select throws_ok(
  $$update public.timetable_periods set academic_year=2199 where id='fc150000-0000-4000-8000-000000000001'$$,
  'Timetable period tenant, school, academic year, and period number are immutable',
  'timetable period identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_academic_year_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_academic_term_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_school_day_override_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_timetable_period_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_academic_year_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_academic_term_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_day_override_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_timetable_period_scope_integrity()','EXECUTE'),
  'academic calendar integrity trigger helpers are private from client roles'
);

select * from finish();
rollback;
