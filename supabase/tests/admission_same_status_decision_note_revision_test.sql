begin;
select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
('f1324000-0000-4000-8000-000000000011','e2e-admission-note-admin@example.test','authenticated','authenticated',now(),now()),
('f1324000-0000-4000-8000-000000000012','e2e-admission-note-outsider@example.test','authenticated','authenticated',now(),now()),
('f1324000-0000-4000-8000-000000000013','e2e-admission-note-forger@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111',
       '22222222-2222-4222-8222-222222222222',
       'f1324000-0000-4000-8000-000000000011','school_admin',current_date);

insert into public.admission_applications(
 id,tenant_id,school_id,academic_year,requested_grade_id,
 applicant_first_names,applicant_surname,status,source
) values (
 'f1324000-0000-4000-8000-000000000014',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 2026,'30000000-0000-4000-8000-000000000010',
 'Note','Audit Synthetic','received','school'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','f1324000-0000-4000-8000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
 $$select public.decide_admission_application(
 'f1324000-0000-4000-8000-000000000014','accepted','Initial accepted note')$$,
 'first transition is accepted and audited'
);
select is(
 (select decision_note from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 'Initial accepted note','decision stores reviewer note'
);
select is(
 (select reviewed_by_user_id::text from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 'f1324000-0000-4000-8000-000000000011','review actor is authenticated admin'
);
select ok(
 (select reviewed_at > now()-interval '1 minute' from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 'initial decision timestamp is server-derived'
);
select set_config('test.admission_original_reviewed_at',(
 select reviewed_at::text from public.admission_applications
 where id='f1324000-0000-4000-8000-000000000014'
),true);
select lives_ok(
 $$select public.decide_admission_application(
 'f1324000-0000-4000-8000-000000000014','accepted','Revised without status change')$$,
 'same-status reviewer note revision is allowed'
);
select is(
 (select decision_note from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 'Revised without status change','note-only edit persists'
);
select is(
 (select reviewed_at::text from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 current_setting('test.admission_original_reviewed_at'),
 'original decision review timestamp is immutable on same-status note revisions'
);
select throws_ok(
 $$update public.admission_applications
   set reviewed_by_user_id='f1324000-0000-4000-8000-000000000013'
   where id='f1324000-0000-4000-8000-000000000014'$$,
 'Admission review provenance is server-managed',
 'direct attempted reviewer forgery remains forbidden'
);
select lives_ok(
 $$select public.decide_admission_application(
 'f1324000-0000-4000-8000-000000000014','accepted',null)$$,
 'clearing an existing note without changing decision is allowed'
);
select is(
 (select decision_note from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 null,'clearing reviewer note persists null'
);
select is(
 (select count(*)::integer from public.audit_events
  where entity_id='f1324000-0000-4000-8000-000000000014'
    and event_type='admission.decided'),3,
 'each original decision and both note-only revisions retain audit history'
);
select throws_ok(
 $$select public.decide_admission_application(
 'f1324000-0000-4000-8000-000000000014','accepted',repeat('X',1001))$$,
 'Admission decision note exceeds 1000 characters',
 'RPC rejects direct bypass of UI note length limit'
);
select is(
 (select count(*)::integer from public.audit_events
  where entity_id='f1324000-0000-4000-8000-000000000014'
    and event_type='admission.decided'),3,
 'rejected oversized note produces no persisted audit event'
);
select set_config('request.jwt.claim.sub','f1324000-0000-4000-8000-000000000012',true);
select throws_ok(
 $$select public.decide_admission_application(
 'f1324000-0000-4000-8000-000000000014','accepted','Cross school edit')$$,
 'Permission denied',
 'unassigned outsider cannot revise school admission decision'
);

select set_config('request.jwt.claim.sub','f1324000-0000-4000-8000-000000000011',true);
select lives_ok(
 $$select public.decide_admission_application_checked(
 'f1324000-0000-4000-8000-000000000014','accepted','Versioned note',
 'accepted',null,current_setting('test.admission_original_reviewed_at')::timestamptz)$$,
 'checked RPC accepts a current expected decision version'
);
select throws_ok(
 $$select public.decide_admission_application_checked(
 'f1324000-0000-4000-8000-000000000014','accepted','Stale overwrite',
 'accepted',null,current_setting('test.admission_original_reviewed_at')::timestamptz)$$,
 'Admission decision changed; reload before saving',
 'stale editor cannot overwrite another reviewer note'
);
select is(
 (select decision_note from public.admission_applications
  where id='f1324000-0000-4000-8000-000000000014'),
 'Versioned note','rejected stale edit leaves latest reviewer note intact'
);
select is(
 (select count(*)::integer from public.audit_events
  where entity_id='f1324000-0000-4000-8000-000000000014'
    and event_type='admission.decided'),4,
 'only successful checked revision adds an audit event'
);

select * from finish();
rollback;
