begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6b00000-0000-4000-8000-000000000001','historical-transfer-actor@example.test','authenticated','authenticated',now(),now()),
('f6b00000-0000-4000-8000-000000000002','current-transfer-manager@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from
) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6b00000-0000-4000-8000-000000000001','school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6b00000-0000-4000-8000-000000000002','school_admin',current_date-1);

insert into public.transfer_events(
  id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,
  requested_on,effective_on,reason,status,initiated_by_user_id
) values (
  'f6b10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '50000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  '60000000-0000-4000-8000-000000000001',
  'Historical Actor Receiving School',
  current_date,
  current_date+1,
  'Historical actor regression fixture',
  'requested',
  'f6b00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6b00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.approve_learner_transfer('f6b10000-0000-4000-8000-000000000001',current_date+1,'Approved before placement ended')$$,
  'authorized historical actor can approve while current'
);

select is(
  (select approved_by_user_id::text from public.transfer_events where id='f6b10000-0000-4000-8000-000000000001'),
  'f6b00000-0000-4000-8000-000000000001',
  'approval provenance records the historical actor'
);

update public.school_memberships
set active_to=current_date-1
where user_id='f6b00000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222';

select set_config('request.jwt.claim.sub','f6b00000-0000-4000-8000-000000000002',true);

select lives_ok(
  $$select public.complete_learner_transfer('f6b10000-0000-4000-8000-000000000001')$$,
  'current manager can complete an approved transfer after the historical approver leaves'
);

select is(
  (select status from public.transfer_events where id='f6b10000-0000-4000-8000-000000000001'),
  'completed',
  'transfer reaches terminal completed state'
);

select is(
  (select approved_by_user_id::text from public.transfer_events where id='f6b10000-0000-4000-8000-000000000001'),
  'f6b00000-0000-4000-8000-000000000001',
  'later completion preserves original approver provenance'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'transferred',
  'completion still closes the canonical source enrolment'
);

select throws_ok(
  $$update public.transfer_events set approved_by_user_id='f6b00000-0000-4000-8000-000000000002' where id='f6b10000-0000-4000-8000-000000000001'$$,
  'Transfer approval actor provenance is immutable once recorded',
  'terminal transfer provenance remains immutable'
);

select * from finish();
rollback;
