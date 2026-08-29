begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9000000-0000-4000-8000-000000000001','detention-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.school_late_arrival_policies(
  school_id,tenant_id,weekly_threshold,detention_weekday,carry_forward,active,updated_by_user_id
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',2,3,true,true,'f9000000-0000-4000-8000-000000000001'
)
on conflict(school_id) do update
set weekly_threshold=2,detention_weekday=3,carry_forward=true,active=true,updated_by_user_id=excluded.updated_by_user_id;

select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-24','08:05','Monday late')$$,
  'first late arrival is recorded under configured school policy'
);

select is(
  (select count(*)::integer from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24'),
  0,
  'detention is not created before weekly threshold is reached'
);

select lives_ok(
  $$select public.record_school_late_arrival('60000000-0000-4000-8000-000000000001','2026-08-25','08:06','Tuesday late')$$,
  'second late arrival reaches configured weekly threshold'
);

select is(
  (select due_on from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24'),
  '2026-08-26'::date,
  'detention due date honors configured Wednesday instead of hard-coded Friday'
);

select is(
  public.roll_forward_late_detentions('22222222-2222-4222-8222-222222222222','2026-08-27'),
  1,
  'overdue detention is carried forward when school policy enables carry-forward'
);

select is(
  (select due_on from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24'),
  '2026-09-02'::date,
  'carry-forward uses the next configured Wednesday'
);

update public.school_late_arrival_policies
set carry_forward=false
where school_id='22222222-2222-4222-8222-222222222222';
update public.late_detention_obligations
set status='pending',due_on='2026-08-26'
where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24';

select is(
  public.roll_forward_late_detentions('22222222-2222-4222-8222-222222222222','2026-08-27'),
  0,
  'carry-forward operation is disabled when school policy disables it'
);

select is(
  public.resolve_late_detention(
    (select id from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24'),
    'waived','Leadership waiver test'
  ),
  true,
  'authorized leader can resolve an unresolved detention obligation'
);

select throws_ok(
  $$select public.resolve_late_detention((select id from public.late_detention_obligations where learner_id='50000000-0000-4000-8000-000000000001' and qualifying_week_start='2026-08-24'),'completed','second resolution')$$,
  'Detention obligation is already resolved',
  'resolved detention cannot be silently resolved a second time'
);

select * from finish();
rollback;