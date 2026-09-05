begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fea00000-0000-4000-8000-000000000001','attendance-actor-admin@example.test','authenticated','authenticated',now(),now()),
  ('fea00000-0000-4000-8000-000000000002','attendance-actor-outsider@example.test','authenticated','authenticated',now(),now()),
  ('fea00000-0000-4000-8000-000000000003','attendance-actor-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fea00000-0000-4000-8000-000000000004','attendance-actor-other-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fea00000-0000-4000-8000-000000000004','teacher',current_date-1);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fea10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fea00000-0000-4000-8000-000000000003','ATT-ACTOR-T','Allocated','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'fea20000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fea10000-0000-4000-8000-000000000003','teacher',current_date-5,'fea00000-0000-4000-8000-000000000001'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fea30000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ATT-ACTOR','Attendance Actor Subject','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fea40000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
   'fea30000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010',1,'active');

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values(
  'fea50000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'fea40000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001a','fea10000-0000-4000-8000-000000000003',current_date-5
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at
) values(
  'fea60000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  28,'Attendance Actor Period','14:00','14:45'
);

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status
) values(
  'fea70000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'ATT-ACTOR',extract(isodow from current_date)::smallint,'fea60000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-00000000001a','fea50000-0000-4000-8000-000000000003','active'
);

select lives_ok(
  $$insert into public.attendance_register_submissions(
      id,tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id
    ) values(
      'fea80000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '40000000-0000-4000-8000-00000000001a',current_date,'fea00000-0000-4000-8000-000000000001'
    )$$,
  'trusted setup accepts an authorized daily-register recorder'
);

select throws_ok(
  $$insert into public.attendance_register_submissions(
      tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '40000000-0000-4000-8000-00000000001a',current_date,'fea00000-0000-4000-8000-000000000002'
    )$$,
  'Daily attendance recorder is not authorized for school',
  'trusted writer cannot attribute a daily register to an unrelated account'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$insert into public.attendance_register_submissions(
      tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '40000000-0000-4000-8000-00000000001a',current_date,'fea00000-0000-4000-8000-000000000004'
    )$$,
  'Daily attendance recorder must match authenticated actor',
  'authenticated attendance manager cannot spoof another authorized recorder'
);
select set_config('request.jwt.claim.sub','',true);

select throws_ok(
  $$update public.attendance_register_submissions
    set recorded_by_user_id='fea00000-0000-4000-8000-000000000004'
    where id='fea80000-0000-4000-8000-000000000001'$$,
  'Daily attendance recorder provenance is immutable',
  'daily register recorder cannot be rewritten'
);

select lives_ok(
  $$insert into public.attendance_events(
      id,tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id
    ) values(
      'fea90000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',
      current_date,'daily_register','late','fea00000-0000-4000-8000-000000000001'
    )$$,
  'authorized recorder can own a daily attendance event'
);

select throws_ok(
  $$insert into public.attendance_events(
      tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,status,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',
      current_date,'daily_register','absent','fea00000-0000-4000-8000-000000000002'
    )$$,
  'Attendance event recorder is not authorized for school',
  'trusted writer cannot forge a daily attendance event recorder'
);

select lives_ok(
  $$update public.attendance_events set status='excused',note='corrected detail'
    where id='fea90000-0000-4000-8000-000000000001'$$,
  'non-provenance attendance detail remains mutable for existing correction semantics'
);

select throws_ok(
  $$update public.attendance_events set recorded_by_user_id='fea00000-0000-4000-8000-000000000004'
    where id='fea90000-0000-4000-8000-000000000001'$$,
  'Attendance event recorder provenance is immutable',
  'attendance event recorder cannot be rewritten'
);

select lives_ok(
  $$insert into public.subject_attendance_submissions(
      id,tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,recorded_by_user_id
    ) values(
      'feaa0000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fea70000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001a',current_date,'fea00000-0000-4000-8000-000000000003'
    )$$,
  'date-valid allocated teacher with active placement can own subject attendance'
);

select throws_ok(
  $$insert into public.subject_attendance_submissions(
      tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fea70000-0000-4000-8000-000000000003','40000000-0000-4000-8000-00000000001a',current_date,'fea00000-0000-4000-8000-000000000004'
    )$$,
  'Subject attendance recorder is not authorized for timetable slot and date',
  'ordinary school teacher cannot forge ownership of another teacher subject register'
);

select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$select public.record_attendance_event(
      '60000000-0000-4000-8000-000000000001',current_date,'absent',null,null,'subject_period',
      'fea70000-0000-4000-8000-000000000003',null,null,'online'
    )$$,
  'Attendance event recorder is not authorized for subject timetable slot and date',
  'generic attendance event RPC cannot bypass subject timetable allocation authority'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

select set_config('request.jwt.claim.sub','fea00000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok(
  $$select public.submit_subject_period_attendance(
      'fea70000-0000-4000-8000-000000000003',current_date,'[]'::jsonb,'actor integrity',
      'feab0000-0000-4000-8000-000000000003',null,'online'
    )$$,
  'governed subject attendance RPC remains compatible for the allocated teacher'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_record_daily_attendance(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_record_subject_attendance(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_daily_attendance_submission_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_subject_attendance_submission_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_attendance_event_actor_integrity()','EXECUTE'),
  'attendance actor helpers remain private from authenticated clients'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname in (
     'zz_daily_attendance_submission_actor_integrity_trg',
     'zz_subject_attendance_submission_actor_integrity_trg',
     'zz_attendance_event_actor_integrity_trg'
   ) and not tgisinternal),
  3,
  'all three attendance actor guards are installed exactly once'
);

select is(
  (select count(*)::integer from public.subject_attendance_submissions
   where timetable_slot_id='fea70000-0000-4000-8000-000000000003'),
  2,
  'only the trusted valid setup and allocated-teacher RPC submission persist in this transaction'
);

select * from finish();
rollback;
