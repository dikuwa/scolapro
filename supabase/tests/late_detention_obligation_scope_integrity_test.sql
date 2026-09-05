begin;

select plan(26);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc700000-0000-4000-8000-000000000001','late-detention-scope@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000002','late-detention-scope-2@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000003','late-detention-admin@example.test','authenticated','authenticated',now(),now());

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fc710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Scope','Learner A'),
  ('fc710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Automatic','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fc720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',2026,'2026-01-01','current'),
  ('fc720000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000002',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('fc730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc700000-0000-4000-8000-000000000001','Scope','Staff A','active'),
  ('fc730000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc700000-0000-4000-8000-000000000002','Scope','Staff A2','active'),
  ('fc730000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',null,'Scope','Unassigned Staff','active');

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001','teacher','2026-01-01','2026-02-10'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000002','fc730000-0000-4000-8000-000000000002','teacher','2026-01-01',null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000003',null,'school_admin','2026-01-01',null);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fc731000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc730000-0000-4000-8000-000000000001','teacher','2026-01-01','2026-02-03','fc700000-0000-4000-8000-000000000003'),
  ('fc731000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc730000-0000-4000-8000-000000000002','teacher','2026-02-04',null,'fc700000-0000-4000-8000-000000000003');

insert into public.school_late_arrival_policies(
  school_id,tenant_id,cumulative_threshold,detention_weekday,carry_forward,active
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',1,5,true,true
)
on conflict(school_id) do update
set cumulative_threshold=excluded.cumulative_threshold,
    detention_weekday=excluded.detention_weekday,
    carry_forward=excluded.carry_forward,
    active=excluded.active;

insert into public.school_late_arrival_events(
  id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id
) values(
  'fc740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001','2026-02-03','fc700000-0000-4000-8000-000000000001'
);

insert into public.tenants(id,name,slug)
values('fc800000-0000-4000-8000-000000000001','Late Detention Scope Tenant B','late-detention-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fc810000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Late Detention Scope School B','LDS-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  'fc800000-0000-4000-8000-000000000001','fc810000-0000-4000-8000-000000000001',
  'fc700000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.learners(id,tenant_id,first_names,surname)
values('fc820000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Scope','Learner B');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fc830000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fc840000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','Scope','Staff B','active');

insert into public.school_late_arrival_events(
  id,tenant_id,school_id,learner_id,enrolment_id,arrival_date,recorded_by_user_id
) values(
  'fc850000-0000-4000-8000-000000000001','fc800000-0000-4000-8000-000000000001','fc810000-0000-4000-8000-000000000001',
  'fc820000-0000-4000-8000-000000000001','fc830000-0000-4000-8000-000000000001','2026-02-03','fc700000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year)
    values('fc800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026)$$,
  'Late detention obligation scope mismatch: school does not belong to tenant',
  'late detention obligation tenant must match school tenant'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc820000-0000-4000-8000-000000000001',3,'2026-02-06',2026)$$,
  'Late detention obligation scope mismatch: learner does not belong to tenant',
  'late detention obligation learner must match tenant'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc850000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: trigger event does not match obligation scope',
  'trigger event must match obligation tenant school and learner'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2025,'2026-02-03','fc740000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: trigger event does not match academic year',
  'trigger event must match obligation academic year'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-04','fc740000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: triggered date does not match late-arrival event',
  'triggered date must match the trigger event date'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id,assigned_staff_member_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc740000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000001')$$,
  'Late detention obligation scope mismatch: assigned staff does not belong to tenant',
  'assigned detention staff must match obligation tenant'
);

select throws_ok(
  $$insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id,assigned_staff_member_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc740000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000003')$$,
  'Late detention obligation scope mismatch: assigned staff is not assigned to school on due date',
  'same-tenant staff without a school placement cannot own a late-detention obligation'
);

select lives_ok(
  $$insert into public.late_detention_obligations(
      id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,academic_year,triggered_on,trigger_event_id,assigned_staff_member_id
    ) values(
      'fc860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fc710000-0000-4000-8000-000000000001',3,'2026-02-06',2026,'2026-02-03','fc740000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001'
    )$$,
  'valid late detention obligation remains allowed while staff placement covers its due date'
);

select throws_ok(
  $$update public.late_detention_obligations set status='carried_forward', due_on='2026-02-13', rollover_count=1 where id='fc860000-0000-4000-8000-000000000001'$$,
  'Late detention obligation scope mismatch: assigned staff is not assigned to school on due date',
  'rollover cannot carry assigned staff beyond the end of their school placement'
);

select lives_ok(
  $$update public.late_detention_obligations set assigned_staff_member_id='fc730000-0000-4000-8000-000000000002' where id='fc860000-0000-4000-8000-000000000001'$$,
  'replacement with staff assigned to the obligation school remains allowed'
);

select lives_ok(
  $$update public.late_detention_obligations set status='carried_forward', due_on='2026-02-13', rollover_count=1 where id='fc860000-0000-4000-8000-000000000001'$$,
  'ordinary rollover remains allowed when the replacement supervisor placement covers the new date'
);

select throws_ok(
  $$update public.late_detention_obligations set academic_year=2027 where id='fc860000-0000-4000-8000-000000000001'$$,
  'Late detention obligation tenant, school, learner, academic year, and trigger event are immutable',
  'late detention obligation identity scope cannot move after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_late_detention_obligation_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_late_detention_obligation_scope_integrity()','EXECUTE'),
  'late detention obligation integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.late_detention_obligations'::regclass and tgname='late_detention_obligation_scope_integrity_trg' and not tgisinternal),
  1,
  'late detention obligations have exactly one scope-integrity trigger'
);

select is(
  app_private.staff_member_has_school_assignment(
    'fc730000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','2026-02-06'
  ),
  true,
  'legacy staff-linked school membership is accepted on the actual detention due date'
);

select is(
  app_private.staff_member_has_school_assignment(
    'fc730000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','2026-02-13'
  ),
  false,
  'expired school placement is rejected on a later detention date'
);

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on
) values(
  'fc860000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc710000-0000-4000-8000-000000000001',1,'2026-02-06','pending',2026,'2026-02-03','2026-02-06'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000003',true);
set local role authenticated;

select ok(
  public.record_school_late_arrival('fc720000-0000-4000-8000-000000000002','2026-02-03',null,'due-date supervisor QA') is not null,
  'threshold late-arrival workflow creates its durable event under management authorization'
);

select is(
  (select due_on from public.late_detention_obligations
   where learner_id='fc710000-0000-4000-8000-000000000002' and academic_year=2026),
  '2026-02-06'::date,
  'automatic detention uses the configured next detention weekday'
);

reset role;
select ok(
  (select assigned_staff_member_id is not null
      and app_private.staff_member_has_school_assignment(
        assigned_staff_member_id,school_id,due_on
      )
   from public.late_detention_obligations
   where learner_id='fc710000-0000-4000-8000-000000000002' and academic_year=2026),
  'automatic supervisor selection is valid on the detention due date rather than merely on the arrival date'
);
set local role authenticated;

select is(
  public.reassign_late_detention_supervisor(
    'fc860000-0000-4000-8000-000000000002','fc730000-0000-4000-8000-000000000001'
  ),
  true,
  'manual reassignment validates historical placement on the obligation due date instead of current_date'
);

select is(
  (select assigned_staff_member_id from public.late_detention_obligations where id='fc860000-0000-4000-8000-000000000002'),
  'fc730000-0000-4000-8000-000000000001'::uuid,
  'due-date-valid historical supervisor reassignment persists'
);

select ok(
  public.roll_forward_late_detentions('22222222-2222-4222-8222-222222222222','2026-02-10') >= 1,
  'roll-forward processes overdue detention obligations without aborting on expired supervisor placement'
);

select is(
  (select due_on from public.late_detention_obligations where id='fc860000-0000-4000-8000-000000000002'),
  '2026-02-13'::date,
  'roll-forward moves the obligation to the next configured detention date'
);

reset role;
select ok(
  (select assigned_staff_member_id is distinct from 'fc730000-0000-4000-8000-000000000001'::uuid
      and assigned_staff_member_id is not null
      and app_private.staff_member_has_school_assignment(assigned_staff_member_id,school_id,due_on)
   from public.late_detention_obligations
   where id='fc860000-0000-4000-8000-000000000002'),
  'roll-forward replaces an expired supervisor with staff valid on the new due date'
);
set local role authenticated;

select is(
  (select status from public.late_detention_obligations where id='fc860000-0000-4000-8000-000000000002'),
  'carried_forward',
  'roll-forward preserves the obligation lifecycle state while repairing supervision'
);

select ok(
  not has_function_privilege('authenticated','app_private.staff_member_has_school_assignment(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('anon','app_private.staff_member_has_school_assignment(uuid,uuid,date)','EXECUTE'),
  'date-aware staff-placement helper remains private from client roles'
);

reset role;
select * from finish();
rollback;
