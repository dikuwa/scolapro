begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','transfer-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.transfer_events(
  id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,
  requested_on,effective_on,reason,status,initiated_by_user_id
) values
  ('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001','Receiving School',current_date,current_date+1,'Family relocation','requested','fa000000-0000-4000-8000-000000000001'),
  ('fa100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000002','Another Receiving School',current_date,current_date+2,'Parent request','requested','fa000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.complete_learner_transfer('fa100000-0000-4000-8000-000000000001')$$,
  'Only approved transfers can be completed',
  'requested transfer cannot skip approval and close the enrolment'
);

select ok(
  not has_table_privilege('authenticated','public.transfer_events','UPDATE'),
  'authenticated clients cannot bypass the governed transfer lifecycle with direct updates'
);

select lives_ok(
  $$select public.approve_learner_transfer('fa100000-0000-4000-8000-000000000001',current_date+1,'Documents checked')$$,
  'authorized enrolment manager can approve a requested transfer'
);

select is(
  (select status from public.transfer_events where id='fa100000-0000-4000-8000-000000000001'),
  'approved',
  'approval records the approved state'
);

select is(
  (select decision_note from public.transfer_events where id='fa100000-0000-4000-8000-000000000001'),
  'Documents checked',
  'approval rationale is preserved separately from the original transfer reason'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'current',
  'approval alone does not close the learner source enrolment'
);

select lives_ok(
  $$select public.complete_learner_transfer('fa100000-0000-4000-8000-000000000001')$$,
  'approved transfer can be completed'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'transferred',
  'completion closes the source enrolment as transferred'
);

select lives_ok(
  $$select public.cancel_learner_transfer('fa100000-0000-4000-8000-000000000002','Transfer withdrawn by guardian')$$,
  'open requested transfer can be cancelled with a reason'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='transfer_event' and entity_id='fa100000-0000-4000-8000-000000000001' and event_type in ('learner.transfer.approved','learner.transfer.completed')),
  2,
  'approval and completion retain separate audit provenance'
);

select * from finish();
rollback;