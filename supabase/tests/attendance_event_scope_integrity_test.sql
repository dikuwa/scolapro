begin;

select plan(8);

insert into auth.users(id,email,created_at,updated_at)
values ('fd100000-0000-4000-8000-000000000001','attendance-event@example.test',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','teacher',current_date);

insert into public.tenants(id,name,slug)
values ('fd110000-0000-4000-8000-000000000001','Attendance Event Tenant B','attendance-event-tenant-b');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fd120000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','Cross','Tenant');

select throws_ok(
  $$insert into public.attendance_events(tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id)
    values('fd110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-02','daily_register','present','fd100000-0000-4000-8000-000000000001')$$,
  'Attendance event scope mismatch: school does not belong to tenant',
  'attendance event tenant must match school tenant'
);

select throws_ok(
  $$insert into public.attendance_events(tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd120000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-02','daily_register','present','fd100000-0000-4000-8000-000000000001')$$,
  'Attendance event scope mismatch: learner does not belong to tenant',
  'attendance event learner must match event tenant'
);

select lives_ok(
  $$insert into public.attendance_events(id,tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id)
    values('fd130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-02','daily_register','absent','fd100000-0000-4000-8000-000000000001')$$,
  'valid daily attendance event remains allowed'
);

select lives_ok(
  $$update public.attendance_events set status='excused', note='updated reason' where id='fd130000-0000-4000-8000-000000000001'$$,
  'non-scope attendance details remain mutable'
);

select throws_ok(
  $$update public.attendance_events set attendance_date='2026-02-03' where id='fd130000-0000-4000-8000-000000000001'$$,
  'Attendance event scope and provenance are immutable',
  'attendance event scope cannot be rewritten after creation'
);

select lives_ok(
  $$insert into public.attendance_events(id,tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id,replaces_event_id)
    values('fd130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-02','daily_register','present','fd100000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001')$$,
  'same-scope attendance correction remains allowed'
);

select throws_ok(
  $$insert into public.attendance_events(id,tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id,replaces_event_id)
    values('fd130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-03','daily_register','present','fd100000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001')$$,
  'Attendance event scope mismatch: replaced event does not match correction scope',
  'attendance correction cannot replace an event from another date or scope'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_attendance_event_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_attendance_event_scope_integrity()','EXECUTE'),
  'attendance event integrity helper is private from client roles'
);

select * from finish();
rollback;