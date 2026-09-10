begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa100000-0000-4000-8000-000000000001','late-period-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000002','late-period-duty@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000003','late-period-denied@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fa110000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fa100000-0000-4000-8000-000000000002',
  'LATE-PERIOD-DUTY','Period','Duty','active'
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001',null,'school_admin',current_date - 100),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000002','fa110000-0000-4000-8000-000000000001','teacher',current_date - 100);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa110000-0000-4000-8000-000000000001','teacher',current_date - 100,current_date + 100,
  'fa100000-0000-4000-8000-000000000001'
);

insert into public.school_duty_assignments(
  tenant_id,school_id,staff_member_id,duty_key,active_from,active_to,assigned_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa110000-0000-4000-8000-000000000001','late_arrival_recorder',current_date - 100,current_date + 100,
  'fa100000-0000-4000-8000-000000000001'
);

update public.enrolments
set enrolled_from = current_date - 10,
    enrolled_to = current_date - 2,
    status = 'current'
where id = '60000000-0000-4000-8000-000000000001';

update public.enrolments
set enrolled_from = current_date - 10,
    enrolled_to = current_date,
    status = 'current'
where id = '60000000-0000-4000-8000-000000000002';

insert into public.school_late_arrival_policies(
  school_id,tenant_id,weekly_threshold,cumulative_threshold,detention_weekday,carry_forward,active,updated_by_user_id
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',3,3,5,true,true,
  'fa100000-0000-4000-8000-000000000001'
)
on conflict(school_id) do update
set weekly_threshold=3,cumulative_threshold=3,detention_weekday=5,carry_forward=true,active=true,
    updated_by_user_id=excluded.updated_by_user_id;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);

select lives_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001',%L::date,'08:01','leader valid one')$sql$, current_date - 5),
  'leadership can record when the enrolment is effective on the arrival date'
);

select lives_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001',%L::date,'08:02','leader valid two')$sql$, current_date - 4),
  'leadership authorization remains intact for another effective arrival date'
);

select throws_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001',%L::date,'08:03','before enrolment')$sql$, current_date - 11),
  'Active learner enrolment not found for arrival date',
  'arrival date before enrolled_from is rejected'
);

select throws_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001',%L::date,'08:04','after enrolment')$sql$, current_date - 1),
  'Active learner enrolment not found for arrival date',
  'arrival date after enrolled_to is rejected'
);

select throws_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000002',%L::date,'08:05','future arrival')$sql$, current_date + 1),
  'Future late-arrival dates are not allowed',
  'future arrival date remains rejected'
);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
select lives_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000002',%L::date,'08:06','duty valid')$sql$, current_date - 3),
  'effective late-arrival school duty authorization remains intact'
);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
select throws_ok(
  format($sql$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000002',%L::date,'08:07','denied actor')$sql$, current_date - 2),
  'Permission denied',
  'actor without school duty or leadership authority remains denied'
);

select is(
  (select count(*)::integer from public.school_late_arrival_events
   where enrolment_id='60000000-0000-4000-8000-000000000001'),
  2,
  'rejected before/after-enrolment attempts create no late-arrival events'
);

select is(
  (select count(*)::integer from public.late_detention_obligations
   where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026),
  0,
  'rejected temporal attempts cannot create the third-event detention obligation'
);

select is(
  (select count(*)::integer from public.school_late_arrival_events
   where enrolment_id='60000000-0000-4000-8000-000000000002'),
  1,
  'future and denied attempts create no extra late-arrival events'
);

select is(
  (select count(*)::integer from public.late_detention_obligations
   where learner_id='50000000-0000-4000-8000-000000000002' and academic_year=2026),
  0,
  'future and denied attempts create no detention obligations'
);

select * from finish();
rollback;
