begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9100000-0000-4000-8000-000000000001','late-correction-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f9100000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','DET-CORR-001','Correction','Supervisor','active');
insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000010','teacher','2026-01-01','f9100000-0000-4000-8000-000000000001');

insert into public.school_late_arrival_policies(
  school_id,tenant_id,weekly_threshold,cumulative_threshold,detention_weekday,carry_forward,active,updated_by_user_id
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',3,3,5,true,true,'f9100000-0000-4000-8000-000000000001'
)
on conflict(school_id) do update
set cumulative_threshold=3,detention_weekday=5,carry_forward=true,active=true,updated_by_user_id=excluded.updated_by_user_id;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-03','08:05','one')$$,'first late recorded');
select lives_ok($$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-04','08:06','two')$$,'second late recorded');
select lives_ok($$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-05','08:07','three')$$,'third late creates detention');

select is(
  public.undo_latest_school_late_arrival('60000000-0000-4000-8000-000000000001','Entered learner by mistake'),
  true,
  'leadership can undo the latest late arrival'
);

select is(
  (select count(*)::integer from public.school_late_arrival_events where learner_id='50000000-0000-4000-8000-000000000001' and arrival_date between '2026-08-01' and '2026-08-31'),
  2,
  'undo removes only the latest late-arrival event'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026),
  0,
  'undo also removes the unresolved detention created by that latest trigger'
);

select lives_ok($$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-05','08:07','correctly re-recorded')$$,'corrected late can be recorded again and recreate its obligation');

select throws_ok(
  $$
    select public.resolve_late_detention(
      (select id from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and academic_year=2026 order by created_at desc limit 1),
      'completed','Attended'
    );
    select public.undo_latest_school_late_arrival('60000000-0000-4000-8000-000000000001','Attempt to rewrite history');
  $$,
  'This late arrival cannot be undone because its detention history is already finalized',
  'completed detention history blocks late-arrival undo'
);

select * from finish();
rollback;
