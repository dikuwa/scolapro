begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe100000-0000-4000-8000-000000000001','late-actor-manager@example.test','authenticated','authenticated',now(),now()),
  ('fe100000-0000-4000-8000-000000000002','late-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe100000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

select throws_ok(
  $$insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-05','fe100000-0000-4000-8000-000000000002')$$,
  'Late arrival recorder is not authorized for school and arrival date',
  'trusted write cannot forge an unrelated late-arrival recorder'
);

select lives_ok(
  $$insert into public.school_late_arrival_events(id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id)
    values('fe110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-02-05','fe100000-0000-4000-8000-000000000001')$$,
  'authorized school leader can be recorded as late-arrival actor'
);

select throws_ok(
  $$update public.school_late_arrival_events set recorded_by_user_id='fe100000-0000-4000-8000-000000000002' where id='fe110000-0000-4000-8000-000000000001'$$,
  'Late arrival recorder is not authorized for school and arrival date',
  'late-arrival recorder cannot be rewritten to an unrelated actor'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,academic_year,triggered_on,qualifying_late_count,due_on,original_due_on,status,completed_at,completed_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'2026-02-05',3,'2026-02-06','2026-02-06','completed',now(),'fe100000-0000-4000-8000-000000000001')$$,
  'Late detention obligations cannot be created as resolved',
  'trusted write cannot manufacture a pre-resolved detention obligation'
);

select lives_ok(
  $$insert into public.late_detention_obligations(id,tenant_id,school_id,learner_id,academic_year,triggered_on,qualifying_late_count,due_on,original_due_on,status)
    values('fe120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'2026-02-05',3,'2026-02-06','2026-02-06','pending')$$,
  'canonical unresolved detention obligation remains allowed'
);

select throws_ok(
  $$update public.late_detention_obligations set status='completed',completed_at=now(),completed_by_user_id='fe100000-0000-4000-8000-000000000002' where id='fe120000-0000-4000-8000-000000000001'$$,
  'Late detention resolver is not authorized for this resolution',
  'trusted write cannot forge an unrelated detention completion actor'
);

select lives_ok(
  $$update public.late_detention_obligations set status='completed',completed_at=now(),completed_by_user_id='fe100000-0000-4000-8000-000000000001',resolution_note='served' where id='fe120000-0000-4000-8000-000000000001'$$,
  'authorized school leader can complete detention'
);

select throws_ok(
  $$update public.late_detention_obligations set completed_by_user_id='fe100000-0000-4000-8000-000000000002' where id='fe120000-0000-4000-8000-000000000001'$$,
  'Late detention resolution provenance is immutable',
  'completed detention actor provenance is immutable'
);

select ok(
  (select status='completed'
       and completed_by_user_id='fe100000-0000-4000-8000-000000000001'
       and completed_at is not null
       and resolution_note='served'
   from public.late_detention_obligations
   where id='fe120000-0000-4000-8000-000000000001'),
  'authorized lifecycle preserves durable recorder and resolver provenance'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_record_school_late_arrival(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_record_school_late_arrival(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_resolve_late_detention(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_resolve_late_detention(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_late_arrival_event_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_late_detention_resolution_actor_integrity()','EXECUTE'),
  'late-arrival and detention actor helpers remain private'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname='late_arrival_event_submit_actor_integrity_trg' and not tgisinternal),
  1,
  'late-arrival actor trigger is installed once'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname='late_detention_obligation_submit_resolution_actor_integrity_trg' and not tgisinternal),
  1,
  'late-detention resolution actor trigger is installed once'
);

select * from finish();
rollback;