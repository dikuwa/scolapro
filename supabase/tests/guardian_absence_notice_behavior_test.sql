begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','absence-parent@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','absence-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000002','class_teacher',current_date);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence','Guardian','ABSENCE-GUARDIAN-001');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,priority,effective_from
) values (
  'fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','guardian',true,true,1,current_date-30
);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values('fd300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.submit_guardian_absence_notice('50000000-0000-4000-8000-000000000001',current_date-2,current_date-1,'illness','Learner was unwell')$$,
  'linked guardian can submit an absence notice for their learner'
);

select is(
  (select count(*)::integer from public.guardian_absence_notices where submitted_by_user_id='fd000000-0000-4000-8000-000000000001'),
  1,
  'guardian submission creates exactly one notice'
);

select is(
  (select status from public.guardian_absence_notices where submitted_by_user_id='fd000000-0000-4000-8000-000000000001'),
  'submitted',
  'new guardian notice begins in submitted review state'
);

select is(
  (select count(*)::integer from public.attendance_events where learner_id='50000000-0000-4000-8000-000000000001' and attendance_date between current_date-2 and current_date-1),
  0,
  'guardian notice does not automatically mutate the official attendance register'
);

select throws_ok(
  $$select public.submit_guardian_absence_notice('50000000-0000-4000-8000-000000000002',current_date-2,current_date-1,'illness','Not my learner')$$,
  'You are not linked to this learner',
  'guardian cannot submit absence evidence for an unlinked learner'
);

select throws_ok(
  $$select public.submit_guardian_absence_notice('50000000-0000-4000-8000-000000000001',current_date,current_date-2,'illness',null)$$,
  'Absence end date cannot precede start date',
  'invalid guardian absence date ranges are rejected'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);

select lives_ok(
  $$select public.review_guardian_absence_notice((select id from public.guardian_absence_notices where submitted_by_user_id='fd000000-0000-4000-8000-000000000001'),'accepted','Supporting evidence reviewed')$$,
  'authorized class teacher can review a learner absence notice'
);

select is(
  (select status from public.guardian_absence_notices where submitted_by_user_id='fd000000-0000-4000-8000-000000000001'),
  'accepted',
  'review records accepted status without changing attendance automatically'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='guardian_absence_notice' and event_type in ('guardian.absence_notice.submitted','guardian.absence_notice.reviewed')),
  2,
  'absence submission and review both create audit history'
);

select * from finish();
rollback;
