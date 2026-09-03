begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd900000-0000-4000-8000-000000000001','absence-period-parent@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number,status)
values(
  'fd910000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Absence Period','Guardian','ABS-PERIOD-001','active'
);

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from
) values(
  'fd920000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '50000000-0000-4000-8000-000000000001',
  'fd910000-0000-4000-8000-000000000001',
  'guardian',1,current_date-30
);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values(
  'fd930000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fd910000-0000-4000-8000-000000000001',
  'fd900000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd900000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.submit_guardian_absence_notice(
    '50000000-0000-4000-8000-000000000001',current_date-1,current_date,'illness','Valid current enrolment notice'
  )$$,
  'guardian can submit absence evidence while learner enrolment is effective today'
);

select is(
  (select count(*)::integer from public.guardian_absence_notices where submitted_by_user_id='fd900000-0000-4000-8000-000000000001'),
  1,
  'valid submission creates one guardian absence notice'
);

update public.enrolments
set enrolled_from=current_date+7,
    enrolled_to=null,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select throws_ok(
  $$select public.submit_guardian_absence_notice(
    '50000000-0000-4000-8000-000000000001',current_date+7,current_date+7,'other','Too early'
  )$$,
  'Current learner enrolment not found',
  'future-start current-status enrolment cannot be used for guardian absence submission'
);

update public.enrolments
set enrolled_from=current_date-30,
    enrolled_to=current_date+5,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select throws_ok(
  $$select public.submit_guardian_absence_notice(
    '50000000-0000-4000-8000-000000000001',current_date+4,current_date+6,'other','Past enrolment end'
  )$$,
  'Absence period is outside the learner enrolment period',
  'guardian RPC rejects an absence range extending beyond enrolment end'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(
    tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
    absence_from,absence_to,reason_category,message
  ) values(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'fd910000-0000-4000-8000-000000000001',
    'fd900000-0000-4000-8000-000000000001',
    current_date+4,current_date+6,'other','Direct invalid range'
  )$$,
  'Guardian absence notice scope mismatch: absence period is outside enrolment period',
  'integrity trigger rejects direct notice insert outside enrolment period'
);

select throws_ok(
  $$update public.guardian_absence_notices
    set absence_to=current_date+6
    where submitted_by_user_id='fd900000-0000-4000-8000-000000000001'$$,
  'Guardian absence notice scope mismatch: absence period is outside enrolment period',
  'integrity trigger revalidates absence dates when an existing notice is edited'
);

update public.enrolments
set enrolled_from=current_date-30,
    enrolled_to=current_date-1,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select throws_ok(
  $$select public.submit_guardian_absence_notice(
    '50000000-0000-4000-8000-000000000001',current_date-2,current_date-1,'illness','Ended status lag'
  )$$,
  'Current learner enrolment not found',
  'ended current-status enrolment cannot retain guardian absence submission authority'
);

select is(
  (select count(*)::integer from public.guardian_absence_notices where submitted_by_user_id='fd900000-0000-4000-8000-000000000001'),
  1,
  'rejected lifecycle attempts do not create extra absence notices'
);

select * from finish();
rollback;
