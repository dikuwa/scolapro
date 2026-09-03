begin;

select plan(5);

select trigger_is(
  'public','attendance_events','attendance_events_learner_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'attendance events are guarded by the shared learner enrolment-period boundary'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9600000-0000-4000-8000-000000000001','attendance-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f9600000-0000-4000-8000-000000000001',
  'school_admin',
  '2026-01-01'
);

update public.enrolments
   set enrolled_to='2026-03-31', status='completed'
 where id='60000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.attendance_events(
      tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,
      attendance_date,observation_type,status,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-00000000001a','2026-04-01','daily_register','present',
      'f9600000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'physical attendance rows cannot be dated after the learner enrolment ends'
);

select set_config('request.jwt.claim.sub','f9600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$select public.record_attendance_event(
      '60000000-0000-4000-8000-000000000001','2026-04-01','present'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'attendance RPC cannot record an event after the learner enrolment ends'
);

select lives_ok(
  $$select public.record_attendance_event(
      '60000000-0000-4000-8000-000000000001','2026-03-31','present'
    )$$,
  'attendance on the final enrolled day remains valid'
);

reset role;

select is(
  (select count(*)::bigint
     from public.attendance_events a
    where a.enrolment_id='60000000-0000-4000-8000-000000000001'
      and a.attendance_date>'2026-03-31'),
  0::bigint,
  'failed direct and RPC attempts leave no out-of-period attendance evidence'
);

select * from finish();
rollback;
