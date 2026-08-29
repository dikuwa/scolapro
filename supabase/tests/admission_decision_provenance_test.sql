begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','admission-decision-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','forged-reviewer@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.admission_applications(
  id,tenant_id,school_id,academic_year,requested_grade_id,
  applicant_first_names,applicant_surname,date_of_birth,status,source
) values (
  'fd100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  '30000000-0000-4000-8000-000000000010',
  'Decision','Candidate','2012-06-01','received','school'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$update public.admission_applications
    set status='accepted', reviewed_by_user_id='fd000000-0000-4000-8000-000000000002', reviewed_at='2000-01-01'::timestamptz
    where id='fd100000-0000-4000-8000-000000000001'$$,
  'authorized admission decision transition remains available'
);

select is(
  (select reviewed_by_user_id::text from public.admission_applications where id='fd100000-0000-4000-8000-000000000001'),
  'fd000000-0000-4000-8000-000000000001',
  'client-supplied reviewer identity is replaced with authenticated actor'
);

select ok(
  (select reviewed_at > now() - interval '1 minute' from public.admission_applications where id='fd100000-0000-4000-8000-000000000001'),
  'client-supplied decision timestamp is replaced with server decision time'
);

select throws_ok(
  $$update public.admission_applications
    set reviewed_by_user_id='fd000000-0000-4000-8000-000000000002'
    where id='fd100000-0000-4000-8000-000000000001'$$,
  'Admission review provenance is server-managed',
  'review provenance cannot be rewritten independently after the decision'
);

select lives_ok(
  $$select public.decide_admission_application('fd100000-0000-4000-8000-000000000001','waitlisted','Capacity review')$$,
  'governed decision RPC can revise a non-final decision state'
);

select is(
  (select status||':'||coalesce(decision_note,'') from public.admission_applications where id='fd100000-0000-4000-8000-000000000001'),
  'waitlisted:Capacity review',
  'governed decision records status and decision note'
);

select is(
  (select count(*)::integer from public.audit_events where entity_id='fd100000-0000-4000-8000-000000000001' and event_type='admission.decided'),
  1,
  'governed admission decision emits audit history'
);

select * from finish();
rollback;
