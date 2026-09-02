begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fcc00000-0000-4000-8000-000000000001','assigned-detention-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcc00000-0000-4000-8000-000000000002','assigned-detention-supervisor@example.test','authenticated','authenticated',now(),now()),
  ('fcc00000-0000-4000-8000-000000000003','assigned-detention-peer@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fcc00000-0000-4000-8000-000000000001',
  'school_admin',
  '2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fcc10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcc00000-0000-4000-8000-000000000002','ADS-001','Assigned','Supervisor','active'),
  ('fcc10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fcc00000-0000-4000-8000-000000000003','ADS-002','Peer','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fcc20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcc10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fcc00000-0000-4000-8000-000000000001'),
  ('fcc20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcc10000-0000-4000-8000-000000000002','teacher','2026-01-01',null,'fcc00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values('fcc30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Assigned','Detention');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values(
  'fcc40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcc30000-0000-4000-8000-000000000001',2026,'2026-01-01','current'
);

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values
  ('fcc50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   'fcc30000-0000-4000-8000-000000000001',3,'2026-02-13','pending',2026,'2026-02-10','2026-02-13','fcc10000-0000-4000-8000-000000000001'),
  ('fcc50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   'fcc30000-0000-4000-8000-000000000001',3,'2026-02-20','pending',2026,'2026-02-17','2026-02-20','fcc10000-0000-4000-8000-000000000001');

select ok(
  to_regprocedure('app_private.is_assigned_late_detention_supervisor(uuid)') is not null,
  'assigned-supervisor authorization helper exists'
);

select ok(
  not has_function_privilege('authenticated','app_private.is_assigned_late_detention_supervisor(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.is_assigned_late_detention_supervisor(uuid)','EXECUTE'),
  'assigned-supervisor authorization helper remains private'
);

select ok(
  has_function_privilege('authenticated','public.resolve_late_detention(uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.resolve_late_detention(uuid,text,text)','EXECUTE'),
  'detention resolution RPC remains authenticated-only'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000003',true);
set local role authenticated;

select throws_ok(
  $$select public.resolve_late_detention('fcc50000-0000-4000-8000-000000000001','completed','Peer tried to complete')$$,
  'Permission denied',
  'unassigned peer staff cannot complete another supervisor''s detention obligation'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.resolve_late_detention('fcc50000-0000-4000-8000-000000000001','waived','Supervisor attempted waiver')$$,
  'Permission denied',
  'assigned supervisor cannot waive a detention obligation'
);

select is(
  public.resolve_late_detention(
    'fcc50000-0000-4000-8000-000000000001',
    'completed',
    'Learner attended supervised detention'
  ),
  true,
  'assigned active due-date-valid supervisor can complete their own detention obligation'
);

-- Base detention/audit RLS intentionally does not grant ordinary assigned staff
-- school-wide read access. Verify persisted state as the test owner after proving
-- the authenticated RPC invocation above.
reset role;

select is(
  (select status from public.late_detention_obligations where id='fcc50000-0000-4000-8000-000000000001'),
  'completed',
  'assigned-supervisor completion persists the completed status'
);

select is(
  (select completed_by_user_id from public.late_detention_obligations where id='fcc50000-0000-4000-8000-000000000001'),
  'fcc00000-0000-4000-8000-000000000002'::uuid,
  'completion provenance records the assigned supervisor account'
);

select is(
  (select actor_user_id from public.audit_events
   where event_type='late_detention.resolved'
     and metadata->>'obligation_id'='fcc50000-0000-4000-8000-000000000001'
   limit 1),
  'fcc00000-0000-4000-8000-000000000002'::uuid,
  'resolution audit preserves the assigned supervisor actor'
);

select is(
  (select metadata->>'assigned_supervisor_completion' from public.audit_events
   where event_type='late_detention.resolved'
     and metadata->>'obligation_id'='fcc50000-0000-4000-8000-000000000001'
   limit 1),
  'true',
  'resolution audit explicitly identifies assigned-supervisor completion'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.resolve_late_detention('fcc50000-0000-4000-8000-000000000001','completed','duplicate completion')$$,
  'Detention obligation is already resolved',
  'completed detention remains final against repeat completion'
);

reset role;
update public.staff_school_assignments
set effective_to='2026-02-18'
where id='fcc20000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcc00000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.resolve_late_detention('fcc50000-0000-4000-8000-000000000002','completed','placement expired before due date')$$,
  'Permission denied',
  'assigned staff whose placement ended before the obligation due date cannot complete it'
);

reset role;
select * from finish();
rollback;
