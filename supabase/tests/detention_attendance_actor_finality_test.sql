begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe600000-0000-4000-8000-000000000001','det-attendance-admin@example.test','authenticated','authenticated',now(),now()),
('fe600000-0000-4000-8000-000000000002','det-attendance-supervisor@example.test','authenticated','authenticated',now(),now()),
('fe600000-0000-4000-8000-000000000003','det-attendance-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe600000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fe610000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe600000-0000-4000-8000-000000000002','DET-ATT-ACTOR','Detention','Attendance','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('fe620000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe610000-0000-4000-8000-000000000001','staff',current_date,'fe600000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname) values
('fe630000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Actor','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('fe640000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe630000-0000-4000-8000-000000000001',2026,current_date,'current');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values(
  'fe650000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fe630000-0000-4000-8000-000000000001',3,current_date,'pending',2026,current_date,current_date,'fe610000-0000-4000-8000-000000000001'
);

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,supervisor_staff_member_id,status,created_by_user_id
) values(
  'fe660000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  current_date,'fe610000-0000-4000-8000-000000000001','open','fe600000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$insert into public.detention_session_items(id,tenant_id,school_id,detention_session_id,obligation_id,learner_id)
    values('fe670000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe660000-0000-4000-8000-000000000001','fe650000-0000-4000-8000-000000000001','fe630000-0000-4000-8000-000000000001')$$,
  'detention item starts in canonical scheduled state'
);

select throws_ok(
  $$insert into public.detention_session_items(tenant_id,school_id,detention_session_id,obligation_id,learner_id,attendance_status,recorded_by_user_id,recorded_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe660000-0000-4000-8000-000000000001','fe650000-0000-4000-8000-000000000001','fe630000-0000-4000-8000-000000000001','attended','fe600000-0000-4000-8000-000000000002',now())$$,
  'Detention session item must be created in canonical scheduled state',
  'trusted writer cannot manufacture a pre-recorded attendance item'
);

select throws_ok(
  $$update public.detention_session_items set attendance_status='absent',recorded_at=now() where id='fe670000-0000-4000-8000-000000000001'$$,
  'Detention attendance outcome requires recorder and timestamp',
  'final outcome cannot be stored without recorder provenance'
);

select throws_ok(
  $$update public.detention_session_items set attendance_status='absent',recorded_by_user_id='fe600000-0000-4000-8000-000000000003',recorded_at=now() where id='fe670000-0000-4000-8000-000000000001'$$,
  'Detention attendance recorder is not authorized for session',
  'trusted writer cannot attribute outcome to unrelated user'
);

select lives_ok(
  $$update public.detention_session_items set attendance_status='absent',outcome_note='Did not attend',recorded_by_user_id='fe600000-0000-4000-8000-000000000002',recorded_at=now() where id='fe670000-0000-4000-8000-000000000001'$$,
  'date-valid assigned supervisor can record the final outcome'
);

select throws_ok(
  $$update public.detention_session_items set attendance_status='attended' where id='fe670000-0000-4000-8000-000000000001'$$,
  'Detention attendance outcome provenance is immutable',
  'final attendance status cannot be rewritten'
);

select throws_ok(
  $$update public.detention_session_items set recorded_by_user_id='fe600000-0000-4000-8000-000000000001' where id='fe670000-0000-4000-8000-000000000001'$$,
  'Detention attendance outcome provenance is immutable',
  'final attendance recorder cannot be rewritten'
);

select ok(
  (select attendance_status='absent'
      and recorded_by_user_id='fe600000-0000-4000-8000-000000000002'::uuid
      and recorded_at is not null
      and outcome_note='Did not attend'
   from public.detention_session_items where id='fe670000-0000-4000-8000-000000000001'),
  'stored final outcome retains canonical actor evidence'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_detention_session_item_actor_finality()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_detention_session_item_actor_finality()','EXECUTE')
  and (select count(*)=1 from pg_catalog.pg_trigger
       where tgrelid='public.detention_session_items'::regclass
         and tgname='zz_detention_session_item_actor_finality_trg'
         and not tgisinternal),
  'detention attendance finality guard is private and installed once'
);

select * from finish();
rollback;