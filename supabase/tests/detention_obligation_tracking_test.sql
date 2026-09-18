begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('48500000-0000-4000-8000-000000000001','detention-485-admin@example.test','authenticated','authenticated',now(),now()),
  ('48500000-0000-4000-8000-000000000002','detention-485-supervisor@example.test','authenticated','authenticated',now(),now()),
  ('48500000-0000-4000-8000-000000000003','detention-485-support@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug) values
  ('48510000-0000-4000-8000-000000000001','Detention 485 Other Tenant','detention-485-other');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('48520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Detention 485 Other School','DET-485-SAME','active'),
  ('48520000-0000-4000-8000-000000000002','48510000-0000-4000-8000-000000000001','Detention 485 Cross Tenant School','DET-485-CROSS','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','48500000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','48500000-0000-4000-8000-000000000002','teacher',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','48500000-0000-4000-8000-000000000003','school_admin',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('48500000-0000-4000-8000-000000000003','platform_support',current_date-30);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('48530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','48500000-0000-4000-8000-000000000002','DET-485-SUP','Detention','Supervisor','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('48540000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48530000-0000-4000-8000-000000000001','teacher',current_date-60,null,'48500000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('48550000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lifecycle','Learner'),
  ('48550000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Historical','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status
) values
  ('48560000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-90,null,'current'),
  ('48560000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000002',extract(year from current_date)::integer,current_date-90,current_date-1,'withdrawn');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values
  ('48570000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000001',3,current_date-7,'pending',extract(year from current_date)::integer,current_date-10,current_date-7,'48530000-0000-4000-8000-000000000001'),
  ('48570000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000001',3,current_date-7,'pending',extract(year from current_date)::integer,current_date-10,current_date-7,'48530000-0000-4000-8000-000000000001'),
  ('48570000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000001',3,current_date+7,'pending',extract(year from current_date)::integer,current_date-2,current_date+7,'48530000-0000-4000-8000-000000000001'),
  ('48570000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48550000-0000-4000-8000-000000000002',3,current_date-20,'pending',extract(year from current_date)::integer,current_date-25,current_date-20,null);

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,status,created_by_user_id
) values
  ('48580000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   current_date,'14:00','15:00','48530000-0000-4000-8000-000000000001','open','48500000-0000-4000-8000-000000000001');

insert into public.detention_session_items(
  id,tenant_id,school_id,detention_session_id,obligation_id,learner_id
) values
  ('48590000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48580000-0000-4000-8000-000000000001','48570000-0000-4000-8000-000000000001','48550000-0000-4000-8000-000000000001'),
  ('48590000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '48580000-0000-4000-8000-000000000001','48570000-0000-4000-8000-000000000002','48550000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48500000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.record_detention_attendance(
    '48580000-0000-4000-8000-000000000001',
    '48570000-0000-4000-8000-000000000001',
    'absent',
    'Learner did not attend detention'
  ),
  true,
  'missed detention is recorded as an immutable session outcome'
);
select is(
  public.record_detention_attendance(
    '48580000-0000-4000-8000-000000000001',
    '48570000-0000-4000-8000-000000000002',
    'attended',
    'Detention fulfilled'
  ),
  true,
  'attended detention fulfils exactly its canonical obligation'
);
reset role;

select set_config('request.jwt.claim.sub','48500000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select status from public.late_detention_obligations where id='48570000-0000-4000-8000-000000000001'),
  'pending',
  'missed detention remains outstanding instead of disappearing'
);
select is(
  (select status from public.late_detention_obligations where id='48570000-0000-4000-8000-000000000002'),
  'completed',
  'fulfilled detention is completed without changing sibling obligations'
);
select is(
  (select outstanding_obligations from public.get_detention_obligation_summary('22222222-2222-4222-8222-222222222222',null)),
  3::bigint,
  'summary counts all outstanding canonical obligations, including historical unfulfilled provenance'
);
select is(
  (select missed_outstanding_obligations from public.get_detention_obligation_summary('22222222-2222-4222-8222-222222222222',null)),
  1::bigint,
  'summary exposes unresolved obligations with recorded non-attendance'
);
select is(
  (select partial_learners from public.get_detention_obligation_summary('22222222-2222-4222-8222-222222222222',null)),
  1::bigint,
  'learner with completed and outstanding obligations is visible as partially fulfilled'
);
select is(
  (select multiple_outstanding_learners from public.get_detention_obligation_summary('22222222-2222-4222-8222-222222222222',null)),
  1::bigint,
  'multiple outstanding obligations surface escalation visibility without applying punishment policy'
);
select is(
  (select learner_outstanding_count from public.list_detention_obligation_tracking(
    '22222222-2222-4222-8222-222222222222',null,'partial',1,25
  ) where learner_id='48550000-0000-4000-8000-000000000001' limit 1),
  2::bigint,
  'partial filter retains the learner full obligation context and outstanding count'
);
select is(
  (select currently_enrolled from public.list_detention_obligation_tracking(
    '22222222-2222-4222-8222-222222222222','Historical Learner','outstanding',1,25
  ) limit 1),
  false,
  'historical unfulfilled provenance remains visible while effective enrolment state is explicit'
);
select throws_ok(
  $$select * from public.get_detention_obligation_summary('48520000-0000-4000-8000-000000000001',null)$$,
  'P0001','Permission denied',
  'current-school authorization denies another school in the same tenant'
);
select throws_ok(
  $$select * from public.get_detention_obligation_summary('48520000-0000-4000-8000-000000000002',null)$$,
  'P0001','Permission denied',
  'current-school authorization denies another tenant school'
);
reset role;

select set_config('request.jwt.claim.sub','48500000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.resolve_late_detention('48570000-0000-4000-8000-000000000003','completed','support attempt')$$,
  'P0001','Permission denied',
  'Platform Support cannot gain school-operational detention mutation authority'
);
reset role;
select set_config('request.jwt.claim.sub','48500000-0000-4000-8000-000000000001',true);

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values(
  '48570000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '48550000-0000-4000-8000-000000000001',3,current_date+3,'pending',extract(year from current_date)::integer,current_date,current_date+3,'48530000-0000-4000-8000-000000000001'
);

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,status,created_by_user_id
) values(
  '48580000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  current_date+3,'14:00','15:00','48530000-0000-4000-8000-000000000001','open','48500000-0000-4000-8000-000000000001'
);

insert into public.detention_session_items(
  id,tenant_id,school_id,detention_session_id,obligation_id,learner_id
) values(
  '48590000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '48580000-0000-4000-8000-000000000002','48570000-0000-4000-8000-000000000005','48550000-0000-4000-8000-000000000001'
);

update public.staff_school_assignments
set effective_to=current_date
where id='48540000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','48500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.record_detention_attendance(
    '48580000-0000-4000-8000-000000000002',
    '48570000-0000-4000-8000-000000000005',
    'attended',
    'stale placement attempt'
  )$$,
  'P0001','Permission denied',
  'stale staff placement cannot retain future detention mutation authority'
);
reset role;

select is(
  (select count(*)::integer from public.school_late_arrival_events where learner_id='48550000-0000-4000-8000-000000000001'),
  0,
  'detention fulfilment tracking does not manufacture or rewrite attendance/late-arrival events'
);

select * from finish();
rollback;
