begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe700000-0000-4000-8000-000000000001','control-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fe700000-0000-4000-8000-000000000002','control-reviewer@example.test','authenticated','authenticated',now(),now()),
  ('fe700000-0000-4000-8000-000000000003','control-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fe710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Control School','TST-CTRL','active');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fe720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Control','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fe730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values ('fe740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Control','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values ('fe750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe720000-0000-4000-8000-000000000001','fe740000-0000-4000-8000-000000000001',1,current_date-30);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values ('fe760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe740000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fe710000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000002','school_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000001',true);

select set_config('test.control_notice_one',
  (select public.submit_guardian_absence_notice(
    'fe720000-0000-4000-8000-000000000001', current_date, current_date, 'illness', 'Withdraw me')::text), true);
select ok(current_setting('test.control_notice_one') is not null, 'guardian submits a notice');

select lives_ok(
  format('select public.withdraw_guardian_absence_notice(%L)', current_setting('test.control_notice_one')::uuid),
  'submitting guardian withdraws their own notice'
);
select is(
  (select status from public.guardian_absence_notices where id=current_setting('test.control_notice_one')::uuid),
  'withdrawn',
  'withdrawn status is persisted'
);

select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000002',true);
select throws_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)', current_setting('test.control_notice_one')::uuid, 'accepted', 'Review withdrawn'),
  'Absence notice review state cannot change that way',
  'a withdrawn notice cannot be reviewed'
);

select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000001',true);
select set_config('test.control_notice_two',
  (select public.submit_guardian_absence_notice(
    'fe720000-0000-4000-8000-000000000001', current_date-2, current_date-2, 'family', 'First attempt')::text), true);
select ok(current_setting('test.control_notice_two') is not null, 'a distinct notice is submitted');

select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000002',true);
select lives_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)', current_setting('test.control_notice_two')::uuid, 'returned', 'Please attach evidence'),
  'reviewer returns the notice for follow-up'
);

select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000001',true);
select lives_ok(
  format('select public.resubmit_guardian_absence_notice(%L, %L, %L)', current_setting('test.control_notice_two')::uuid, 'medical_appointment', 'Evidence provided'),
  'submitting guardian resubmits a returned notice'
);
select is(
  (select status||':'||coalesce(reviewed_by_user_id::text,'none') from public.guardian_absence_notices where id=current_setting('test.control_notice_two')::uuid),
  'submitted:none',
  'resubmission re-enters the queue without stale reviewer provenance'
);

select throws_ok(
  format('select public.submit_guardian_absence_notice(%L, %L, %L, %L, %L)',
    'fe720000-0000-4000-8000-000000000001', current_date-2, current_date-2, 'family', 'Retry'),
  'An active absence notice already covers these dates',
  'resubmitted notice still blocks a duplicate submission'
);

-- A second returned notice proves only the submitter can resubmit.
select set_config('test.control_notice_three',
  (select public.submit_guardian_absence_notice(
    'fe720000-0000-4000-8000-000000000001', current_date-4, current_date-4, 'transport', 'Third notice')::text), true);
select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000002',true);
select lives_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)', current_setting('test.control_notice_three')::uuid, 'returned', 'Not the submitter'),
  'reviewer returns the third notice'
);
select throws_ok(
  format('select public.resubmit_guardian_absence_notice(%L, %L, %L)', current_setting('test.control_notice_three')::uuid, 'transport', 'Hijack'),
  'Only the submitting guardian can resubmit this notice',
  'a non-submitter cannot resubmit'
);

select ok(
  (select count(*) >= 2 from public.guardian_absence_notice_events where notice_id=current_setting('test.control_notice_one')::uuid),
  'withdrawn notice retains submit and withdraw history'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.guardian_absence_notice_events where notice_id=current_setting('test.control_notice_one')::uuid),
  0,
  'unrelated account cannot read notice history'
);
select set_config('request.jwt.claim.sub','fe700000-0000-4000-8000-000000000002',true);
select ok(
  (select count(*) > 0 from public.guardian_absence_notice_events where notice_id=current_setting('test.control_notice_one')::uuid),
  'authorized reviewer can read notice history'
);

select ok(
  (select count(*) from public.guardian_absence_notice_events where notice_id=current_setting('test.control_notice_one')::uuid) > 0,
  'event history exists before notice deletion'
);

reset role;
delete from public.guardian_absence_notices where id=current_setting('test.control_notice_one')::uuid;
select is(
  (select count(*)::integer from public.guardian_absence_notice_events where notice_id=current_setting('test.control_notice_one')::uuid),
  0,
  'notice deletion may cascade its event history'
);

select * from finish();
rollback;
