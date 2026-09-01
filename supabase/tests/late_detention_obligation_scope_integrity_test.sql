begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc700000-0000-4000-8000-000000000001','late-detention-scope@example.test','authenticated','authenticated',now(),now());

insert into public.learners(id,tenant_id,first_names,surname)
values('fc710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Scope','Learner A');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fc720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fc730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Scope','Staff A','active');

insert into public.school_late_arrival_events(
  id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id
) values(
  'fc740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001','2026-02-03','fc700000-0000-4000-8000-000000000001'
);

insert into public.tenants(id,name,slug)
values('fc800000-0000-4000-8000-000000000001','Late Detention Scope Tenant B','late-detention-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fc810000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Late Detention Scope School B','LDS-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname)
values('fc820000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Scope','Learner B');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fc830000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fc840000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Scope','Staff B','active');

insert into public.school_late_arrival_events(
  id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id
) values(
  'fc850000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','fc810000-0000-4000-8000-000000000001',
  'fc820000-0000-4000-8000-000000000001','fc830000-0000-4000-8000-000000000001','2026-02-03','fc700000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year)
    values('fc800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026)$$,
  'Late detention obligation scope mismatch: school does not belong to tenant',
  'late detention obligation tenant must match school tenant'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc820000-0000-4000-8000-000000000001',3,'2026-02-06',2026)$$,
  'Late detention obligation scope mismatch: learner does not belong to tenant',
  'late detention obligation learner must match tenant'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc850000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: trigger event does not match obligation scope',
  'trigger event must match obligation tenant school and learner'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2025,'2026-02-03','fc740000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: trigger event does not match academic year',
  'trigger event must match obligation academic year'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-04','fc740000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: triggered date does not match late-arrival event',
  'triggered date must match the trigger event date'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id,assigned_staff_member_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc740000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: assigned staff does not belong to tenant',
  'assigned detention staff must match obligation tenant'
);

select lives_ok(
  $$insert into public.late_detention_obligations(
      id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id,assigned_staff_member_id
    ) values(
      'fc860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc740000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001'
    )$$,
  'valid late detention obligation remains allowed'
);

select lives_ok(
  $$update public.late_detention_obligations set status='carried_forward', due_on='2026-02-13', rollover_count=1 where id='fc860000-0000-4000-8000-000000000001'$$,
  'ordinary detention lifecycle updates remain allowed'
);

select throws_ok(
  $$update public.late_detention_obligations set academic_year=2027 where id='fc860000-0000-4000-8000-000000000001'$$,
  'Late detention obligation tenant, school, learner, academic year, and trigger event are immutable',
  'late detention obligation identity scope cannot move after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_late_detention_obligation_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_late_detention_obligation_scope_integrity()','EXECUTE'),
  'late detention obligation integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.late_detention_obligations'::regclass and tgname='late_detention_obligation_scope_integrity_trg' and not tgisinternal),
  1,
  'late detention obligations have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
