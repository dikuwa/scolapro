begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc700000-0000-4000-8000-000000000001','review-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000002','review-admin-a@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000003','review-admin-b@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('fc710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Review School','TST-REV','active');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fc720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Review','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values ('fc730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values ('fc740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Review','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values ('fc750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc720000-0000-4000-8000-000000000001','fc740000-0000-4000-8000-000000000001',1,current_date-30);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values ('fc760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc740000-0000-4000-8000-000000000001','fc700000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fc710000-0000-4000-8000-000000000001','fc700000-0000-4000-8000-000000000002','school_admin',current_date-10),
  ('11111111-1111-4111-8111-111111111111','fc710000-0000-4000-8000-000000000001','fc700000-0000-4000-8000-000000000003','school_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000001',true);

select set_config('test.review_notice_one',
  (select public.submit_guardian_absence_notice(
    'fc720000-0000-4000-8000-000000000001', current_date, current_date, 'illness', 'First notice')::text), true);
select ok(current_setting('test.review_notice_one') is not null, 'guardian submits an absence notice');

select throws_ok(
  $$select public.submit_guardian_absence_notice(
    'fc720000-0000-4000-8000-000000000001', current_date, current_date, 'illness', 'Retry')$$,
  'An active absence notice already covers these dates',
  'a retried or double-clicked submission cannot create a parallel notice'
);

select set_config('test.review_notice_two',
  (select public.submit_guardian_absence_notice(
    'fc720000-0000-4000-8000-000000000001', current_date-2, current_date-2, 'family', 'Second notice')::text), true);
select ok(current_setting('test.review_notice_two') is not null, 'a distinct absence period is still allowed');

select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000002',true);
select lives_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)',
    current_setting('test.review_notice_one')::uuid, 'accepted', 'Accepted after documents'),
  'reviewer accepts a submitted notice'
);

select throws_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)',
    current_setting('test.review_notice_one')::uuid, 'returned', 'Reopen'),
  'Absence notice review state cannot change that way',
  'an accepted notice cannot be reopened or overwritten by another reviewer'
);

select lives_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)',
    current_setting('test.review_notice_one')::uuid, 'closed', 'Closed after follow-up'),
  'an accepted notice can be formally closed'
);

select throws_ok(
  format('select public.review_guardian_absence_notice(%L, %L, %L)',
    current_setting('test.review_notice_one')::uuid, 'accepted', 'Reopen'),
  'Absence notice review state cannot change that way',
  'a closed notice is final'
);

select lives_ok(
  format('select public.review_guardian_absence_notice_checked(%L, %L, %L, %L, null)',
    current_setting('test.review_notice_two')::uuid, 'accepted', 'First reviewer wins', 'submitted'),
  'a reviewer with the current rendered state can save'
);

select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000003',true);
select throws_ok(
  format('select public.review_guardian_absence_notice_checked(%L, %L, %L, %L, null)',
    current_setting('test.review_notice_two')::uuid, 'returned', 'Stale overwrite', 'submitted'),
  'Absence notice review changed; reload before saving',
  'a stale reviewer form cannot overwrite an intervening decision'
);

select ok(
  exists(
    select 1 from public.notifications
    where recipient_user_id='fc700000-0000-4000-8000-000000000002'
      and title='Absence notice awaiting review'
      and href='/school/absence-reviews'
  ),
  'authorized reviewers are notified of a new notice without sensitive detail'
);

select ok(
  exists(
    select 1 from public.notifications
    where recipient_user_id='fc700000-0000-4000-8000-000000000001'
      and title='Absence notice reviewed'
      and href='/parent'
  ),
  'the submitting guardian is notified of the review outcome'
);

select * from finish();
rollback;
