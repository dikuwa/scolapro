begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa100000-0000-4000-8000-000000000001','detention-plan-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000002','detention-plan-supervisor-a@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000003','detention-plan-supervisor-b@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fa100000-0000-4000-8000-000000000001',
  'school_admin',
  current_date-30
);

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('fa110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000002','Duty','Teacher A','active'),
  ('fa110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000003','Duty','Teacher B','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fa120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa110000-0000-4000-8000-000000000001','teacher',current_date-30,current_date+90,'fa100000-0000-4000-8000-000000000001'),
  ('fa120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa110000-0000-4000-8000-000000000002','teacher',current_date-30,current_date+90,'fa100000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values('fa130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Planned','Detention Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values(
  'fa140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa130000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-30,'current'
);

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on
) values(
  'fa150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa130000-0000-4000-8000-000000000001',3,current_date+7,'pending',extract(year from current_date)::integer,current_date,current_date+7
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_detention_session(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_date+7,
    '14:00'::time,
    '15:00'::time,
    'fa110000-0000-4000-8000-000000000001'::uuid,
    'Room 12'::text,
    'Advance planning QA'::text
  )$$,
  'school leadership can schedule a future detention session'
);

select is(
  (select count(*) from public.detention_session_supervisors where staff_member_id='fa110000-0000-4000-8000-000000000001'),
  1::bigint,
  'legacy primary supervisor is mirrored into the detention duty team'
);

select lives_ok(
  $$select public.set_detention_session_supervisors(
    (select id from public.detention_sessions where school_id='22222222-2222-4222-8222-222222222222' and notes='Advance planning QA'),
    array['fa110000-0000-4000-8000-000000000001'::uuid,'fa110000-0000-4000-8000-000000000002'::uuid]
  )$$,
  'leadership can schedule more than one staff member for the same detention date'
);

select is(
  (select count(*) from public.detention_session_supervisors dss join public.detention_sessions ds on ds.id=dss.detention_session_id where ds.notes='Advance planning QA'),
  2::bigint,
  'both supervisors persist on the session duty team'
);

select is(
  (select count(*) from public.notifications where recipient_user_id='fa100000-0000-4000-8000-000000000003' and title='Detention duty scheduled'),
  1::bigint,
  'new account-linked duty team member receives an in-app notification'
);

select is(
  public.assign_detention_session_learners(
    (select id from public.detention_sessions where notes='Advance planning QA'),
    array['fa150000-0000-4000-8000-000000000001'::uuid],
    'fa110000-0000-4000-8000-000000000002'::uuid
  ),
  1,
  'selected learner obligations can be allocated to a member of the session duty team'
);

select is(
  (select assigned_supervisor_staff_member_id from public.detention_session_items where obligation_id='fa150000-0000-4000-8000-000000000001'),
  'fa110000-0000-4000-8000-000000000002'::uuid,
  'session item records the learner-specific supervisor'
);

select is(
  (select assigned_staff_member_id from public.late_detention_obligations where id='fa150000-0000-4000-8000-000000000001'),
  'fa110000-0000-4000-8000-000000000002'::uuid,
  'legacy obligation assignment stays compatible with self-scoped supervisor reads'
);

select throws_ok(
  $$select public.set_detention_session_supervisors(
    (select id from public.detention_sessions where notes='Advance planning QA'),
    array['fa110000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'Reassign scheduled learners before removing a supervisor from the duty team',
  'a supervisor with scheduled learners cannot be silently removed'
);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);

select ok(
  app_private.can_supervise_detention_session((select id from public.detention_sessions where notes='Advance planning QA')),
  'secondary duty-team supervisor receives the same narrow session-supervision authority'
);

select lives_ok(
  $$select * from public.list_my_detention_supervision(false,1,25)$$,
  'existing self-scoped detention supervision read model remains usable for the assigned supervisor'
);

select is(
  (select count(*) from public.audit_events where event_type in ('detention.session.supervisors_updated','detention.session.learners_allocated') and entity_id=(select id from public.detention_sessions where notes='Advance planning QA')),
  2::bigint,
  'duty-team and learner-allocation planning changes are audit logged'
);

select * from finish();
rollback;
