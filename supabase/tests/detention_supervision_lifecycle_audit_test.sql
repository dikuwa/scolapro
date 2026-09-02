begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fca00000-0000-4000-8000-000000000001','detention-life-admin@example.test','authenticated','authenticated',now(),now()),
  ('fca00000-0000-4000-8000-000000000002','detention-life-supervisor@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fca00000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fca10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',null,'DL-AUD-1','Opted','Out','active'),
  ('fca10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fca00000-0000-4000-8000-000000000002','DL-AUD-2','Available','Supervisor','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fca20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fca00000-0000-4000-8000-000000000001'),
  ('fca20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca10000-0000-4000-8000-000000000002','teacher','2026-01-01',null,'fca00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values('fca30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lifecycle','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values(
  'fca40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fca30000-0000-4000-8000-000000000001',2026,'2026-01-01','current'
);

insert into public.school_late_arrival_policies(
  school_id,tenant_id,cumulative_threshold,detention_weekday,carry_forward,active
) values(
  '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',3,5,true,true
)
on conflict(school_id) do update
set cumulative_threshold=3,detention_weekday=5,carry_forward=true,active=true;

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on
) values(
  'fca50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fca30000-0000-4000-8000-000000000001',3,'2026-02-06','pending',2026,'2026-02-03','2026-02-06'
);

select ok(
  to_regprocedure('app_private.audit_detention_supervision_preference_change()') is not null,
  'preference audit helper exists'
);
select ok(
  not has_function_privilege('authenticated','app_private.audit_detention_supervision_preference_change()','EXECUTE')
  and not has_function_privilege('anon','app_private.audit_detention_supervision_preference_change()','EXECUTE'),
  'preference audit helper remains private'
);
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid='public.detention_supervision_preferences'::regclass
     and tgname='detention_supervision_preference_audit_trg' and not tgisinternal),
  1,
  'preference lifecycle has exactly one semantic audit trigger'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca10000-0000-4000-8000-000000000001',true)$$,
  'authorized direct preference creation remains supported'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='detention_supervision.preference_enabled'
     and entity_type='detention_supervision_preference'
     and metadata->>'staff_member_id'='fca10000-0000-4000-8000-000000000001'),
  1,
  'direct RLS-authorized preference creation is audited'
);

select is(
  (select actor_user_id from public.audit_events
   where event_type='detention_supervision.preference_enabled'
     and metadata->>'staff_member_id'='fca10000-0000-4000-8000-000000000001'
   limit 1),
  'fca00000-0000-4000-8000-000000000001'::uuid,
  'preference audit records the authenticated actor'
);

select is(
  public.set_detention_supervision_eligibility(
    '22222222-2222-4222-8222-222222222222','fca10000-0000-4000-8000-000000000001',false
  ),
  true,
  'governed preference RPC can opt a supervisor out'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='detention_supervision.preference_disabled'
     and metadata->>'staff_member_id'='fca10000-0000-4000-8000-000000000001'),
  1,
  'semantic opt-out is audited exactly once'
);

select is(
  public.set_detention_supervision_eligibility(
    '22222222-2222-4222-8222-222222222222','fca10000-0000-4000-8000-000000000001',false
  ),
  true,
  'repeating the same governed preference remains idempotently successful'
);

select is(
  (select count(*)::integer from public.audit_events
   where entity_type='detention_supervision_preference'
     and metadata->>'staff_member_id'='fca10000-0000-4000-8000-000000000001'),
  2,
  'unchanged preference state does not create duplicate semantic audit events'
);

select is(
  public.roll_forward_late_detentions('22222222-2222-4222-8222-222222222222','2026-02-10'),
  1,
  'roll-forward processes the overdue unassigned obligation'
);

select is(
  (select due_on from public.late_detention_obligations where id='fca50000-0000-4000-8000-000000000001'),
  '2026-02-13'::date,
  'roll-forward moves the obligation to the next configured detention date'
);

select is(
  (select assigned_staff_member_id from public.late_detention_obligations where id='fca50000-0000-4000-8000-000000000001'),
  'fca10000-0000-4000-8000-000000000002'::uuid,
  'roll-forward fills a previously unassigned supervisor while respecting the opt-out preference'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fca50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='roll_forward'
     and metadata->>'staff_member_id'='fca10000-0000-4000-8000-000000000002'),
  1,
  'automatic roll-forward supervisor assignment has durable audit provenance'
);

reset role;
select is(
  (select count(*)::integer from public.notifications
   where recipient_user_id='fca00000-0000-4000-8000-000000000002'
     and school_id='22222222-2222-4222-8222-222222222222'
     and title='Detention supervision assigned'),
  1,
  'newly assigned supervisor receives a roll-forward notification'
);
set local role authenticated;

select is(
  (select rollover_count from public.late_detention_obligations where id='fca50000-0000-4000-8000-000000000001'),
  1,
  'roll-forward lifecycle count remains intact after assignment/audit enrichment'
);

select is(
  (select status from public.late_detention_obligations where id='fca50000-0000-4000-8000-000000000001'),
  'carried_forward',
  'roll-forward lifecycle status remains carried_forward'
);

reset role;
select * from finish();
rollback;