begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9000000-0000-4000-8000-000000000001','detention-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f9000000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','DET-001','Duty','Teacher','active');
insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9000000-0000-4000-8000-000000000010','teacher','2026-01-01','f9000000-0000-4000-8000-000000000001');

insert into public.school_late_arrival_policies(
  school_id,tenant_id,weekly_threshold,cumulative_threshold,detention_weekday,carry_forward,active,updated_by_user_id
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',3,3,5,true,true,'f9000000-0000-4000-8000-000000000001'
)
on conflict(school_id) do update
set weekly_threshold=3,cumulative_threshold=3,detention_weekday=5,carry_forward=true,active=true,updated_by_user_id=excluded.updated_by_user_id;

select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-07-27','08:05','first cumulative late')$$,
  'first cumulative late arrival is recorded'
);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-04','08:06','second cumulative late')$$,
  'second cumulative late may occur in a later week'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026),
  0,
  'two cumulative late arrivals do not create detention yet'
);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-07','08:07','third cumulative late')$$,
  'third cumulative late creates an obligation even though arrivals span multiple weeks'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026),
  1,
  'exactly one obligation exists after the first block of three late arrivals'
);

select is(
  (select due_on from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026 order by created_at limit 1),
  '2026-08-14'::date,
  'a Friday trigger is scheduled for the following Friday, not the same day'
);

select is(
  (select assigned_staff_member_id from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026 order by created_at limit 1),
  'f9000000-0000-4000-8000-000000000010'::uuid,
  'new obligation auto-assigns an eligible active school staff member'
);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-10','08:01','fourth cumulative late')$$,
  'fourth cumulative late starts the next three-late block'
);
select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-11','08:02','fifth cumulative late')$$,
  'fifth cumulative late continues the next three-late block'
);
select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-12','08:03','sixth cumulative late')$$,
  'sixth cumulative late creates another independent obligation while the first remains open'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026),
  2,
  'two separate obligations exist after six cumulative late arrivals'
);

select is(
  public.roll_forward_late_detentions('22222222-2222-4222-8222-222222222222','2026-08-15'),
  2,
  'all unresolved overdue obligations roll forward independently'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and original_due_on='2026-08-14' and due_on='2026-08-21' and rollover_count=1),
  2,
  'roll-forward preserves each original due date while moving the active due date'
);

select is(
  public.resolve_late_detention(
    (select id from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026 order by created_at limit 1),
    'completed','Learner attended detention'
  ),
  true,
  'authorized leader can complete one obligation without clearing the other'
);

select * from finish();
rollback;