begin;

select plan(7);

insert into auth.users(id,email,created_at,updated_at)
values ('ec100000-0000-4000-8000-000000000001','late-arrival@example.test',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ec100000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

insert into public.tenants(id,name,slug)
values ('ec110000-0000-4000-8000-000000000001','Late Arrival Tenant B','late-arrival-tenant-b');

insert into public.learners(id,tenant_id,first_names,surname)
values ('ec120000-0000-4000-8000-000000000001','ec110000-0000-4000-8000-000000000001','Cross','Tenant');

select throws_ok(
  $$insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
    values('ec110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-03','ec100000-0000-4000-8000-000000000001')$$,
  'Late arrival event scope mismatch: school does not belong to tenant',
  'late arrival tenant must match school tenant'
);

select throws_ok(
  $$insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ec120000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-03','ec100000-0000-4000-8000-000000000001')$$,
  'Late arrival event scope mismatch: learner does not belong to tenant',
  'late arrival learner must match event tenant'
);

select throws_ok(
  $$insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-01-01','ec100000-0000-4000-8000-000000000001')$$,
  'Late arrival event scope mismatch: arrival date is outside enrolment period',
  'late arrival date must fall within enrolment period'
);

select lives_ok(
  $$insert into public.school_late_arrival_events(id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,arrived_at,recorded_by_user_id)
    values('ec130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-03','08:10','ec100000-0000-4000-8000-000000000001')$$,
  'valid late arrival event remains allowed'
);

select lives_ok(
  $$update public.school_late_arrival_events set arrived_at='08:15',note='corrected time' where id='ec130000-0000-4000-8000-000000000001'$$,
  'late arrival operational details remain mutable'
);

select throws_ok(
  $$update public.school_late_arrival_events set arrival_date='2026-02-04' where id='ec130000-0000-4000-8000-000000000001'$$,
  'Late arrival event tenant, school, learner, enrolment, and arrival date are immutable',
  'late arrival scope cannot be rewritten after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_late_arrival_event_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_late_arrival_event_scope_integrity()','EXECUTE'),
  'late arrival integrity helper is private from client roles'
);

select * from finish();
rollback;