begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fcb00000-0000-4000-8000-000000000001','manual-detention-admin@example.test','authenticated','authenticated',now(),now()),
  ('fcb00000-0000-4000-8000-000000000002','manual-detention-supervisor-a@example.test','authenticated','authenticated',now(),now()),
  ('fcb00000-0000-4000-8000-000000000003','manual-detention-supervisor-b@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcb00000-0000-4000-8000-000000000001','school_admin','2026-01-01'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fcb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fcb00000-0000-4000-8000-000000000002','MD-RA-1','First','Supervisor','active'),
  ('fcb10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fcb00000-0000-4000-8000-000000000003','MD-RA-2','Second','Supervisor','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fcb20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcb10000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'fcb00000-0000-4000-8000-000000000001'),
  ('fcb20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcb10000-0000-4000-8000-000000000002','teacher','2026-01-01',null,'fcb00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname)
values('fcb30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Manual','Reassignment');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values(
  'fcb40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcb30000-0000-4000-8000-000000000001',2026,'2026-01-01','current'
);

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_late_count,due_on,status,academic_year,triggered_on,original_due_on,assigned_staff_member_id
) values(
  'fcb50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcb30000-0000-4000-8000-000000000001',3,'2026-02-13','pending',2026,'2026-02-10','2026-02-13','fcb10000-0000-4000-8000-000000000001'
);

select ok(
  has_function_privilege('authenticated','public.reassign_late_detention_supervisor(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.reassign_late_detention_supervisor(uuid,uuid)','EXECUTE'),
  'manual reassignment RPC remains authenticated-only'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcb00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.reassign_late_detention_supervisor(
    'fcb50000-0000-4000-8000-000000000001','fcb10000-0000-4000-8000-000000000002'
  ),
  true,
  'authorized school leader can manually reassign the pending obligation'
);

select is(
  (select assigned_staff_member_id from public.late_detention_obligations where id='fcb50000-0000-4000-8000-000000000001'),
  'fcb10000-0000-4000-8000-000000000002'::uuid,
  'manual reassignment persists the new supervisor'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fcb50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='manual_reassignment'),
  1,
  'manual reassignment creates exactly one semantic audit event'
);

select is(
  (select metadata->>'previous_staff_member_id' from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fcb50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='manual_reassignment'
   limit 1),
  'fcb10000-0000-4000-8000-000000000001',
  'manual audit records the previous supervisor'
);

select is(
  (select metadata->>'staff_member_id' from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fcb50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='manual_reassignment'
   limit 1),
  'fcb10000-0000-4000-8000-000000000002',
  'manual audit records the new supervisor'
);

select is(
  (select actor_user_id from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fcb50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='manual_reassignment'
   limit 1),
  'fcb00000-0000-4000-8000-000000000001'::uuid,
  'manual audit preserves the authenticated actor'
);

select is(
  (select count(*)::integer from public.notifications
   where recipient_user_id='fcb00000-0000-4000-8000-000000000003'
     and school_id='22222222-2222-4222-8222-222222222222'
     and title='Detention supervision assigned'),
  1,
  'newly assigned manual supervisor receives a notification'
);

select is(
  public.reassign_late_detention_supervisor(
    'fcb50000-0000-4000-8000-000000000001','fcb10000-0000-4000-8000-000000000002'
  ),
  true,
  'retrying the same manual reassignment remains idempotently successful'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='late_detention.supervisor_reassigned'
     and entity_id='fcb50000-0000-4000-8000-000000000001'
     and metadata->>'reason'='manual_reassignment'),
  1,
  'idempotent retry does not duplicate manual reassignment audit events'
);

select is(
  (select count(*)::integer from public.notifications
   where recipient_user_id='fcb00000-0000-4000-8000-000000000003'
     and school_id='22222222-2222-4222-8222-222222222222'
     and title='Detention supervision assigned'),
  1,
  'idempotent retry does not duplicate supervisor notifications'
);

reset role;
select * from finish();
rollback;
