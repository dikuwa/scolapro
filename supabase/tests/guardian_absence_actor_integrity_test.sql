begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd800000-0000-4000-8000-000000000001','absence-guardian@example.test','authenticated','authenticated',now(),now()),
  ('fd800000-0000-4000-8000-000000000002','absence-reviewer@example.test','authenticated','authenticated',now(),now()),
  ('fd800000-0000-4000-8000-000000000003','absence-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.learners(id,tenant_id,first_names,surname)
values('fd810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence','Actor Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fd820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values('fd840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001',1,current_date-30);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values('fd850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd830000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd800000-0000-4000-8000-000000000002','counsellor',current_date);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to,status,reviewed_by_user_id,reviewed_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','fd820000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001',current_date,current_date,'accepted','fd800000-0000-4000-8000-000000000002',now())$$,
  'Guardian absence notices must be created submitted without review provenance',
  'trusted write cannot manufacture a pre-reviewed absence notice'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','fd820000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000003',current_date,current_date)$$,
  'Guardian absence notice scope mismatch: submitter is not linked to guardian',
  'scope guard still rejects an unrelated trusted submitter first'
);

select lives_ok(
  $$insert into public.guardian_absence_notices(id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('fd860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001','fd820000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001',current_date,current_date)$$,
  'linked guardian can create canonical submitted notice'
);

select throws_ok(
  $$update public.guardian_absence_notices set status='accepted',reviewed_by_user_id='fd800000-0000-4000-8000-000000000003',reviewed_at=now() where id='fd860000-0000-4000-8000-000000000001'$$,
  'Guardian absence notice reviewer is not authorized for learner',
  'trusted write cannot forge an unrelated reviewer'
);

select lives_ok(
  $$update public.guardian_absence_notices set status='under_review',reviewed_by_user_id='fd800000-0000-4000-8000-000000000002',reviewed_at=now(),review_note='Reviewing' where id='fd860000-0000-4000-8000-000000000001'$$,
  'authorized sensitive-data reviewer can review notice'
);

select throws_ok(
  $$update public.guardian_absence_notices set reviewed_by_user_id='fd800000-0000-4000-8000-000000000003',reviewed_at=now() where id='fd860000-0000-4000-8000-000000000001'$$,
  'Guardian absence notice reviewer is not authorized for learner',
  'later review provenance cannot be credited to an unrelated actor'
);

select lives_ok(
  $$update public.guardian_absence_notices set status='accepted',reviewed_by_user_id='fd800000-0000-4000-8000-000000000002',reviewed_at=now(),review_note='Accepted' where id='fd860000-0000-4000-8000-000000000001'$$,
  'authorized reviewer can advance reviewed lifecycle'
);

select ok(
  (select status='accepted' and submitted_by_user_id='fd800000-0000-4000-8000-000000000001' and reviewed_by_user_id='fd800000-0000-4000-8000-000000000002' from public.guardian_absence_notices where id='fd860000-0000-4000-8000-000000000001'),
  'authorized lifecycle preserves submitter and reviewer provenance'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_submit_guardian_absence_notice(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_review_guardian_absence_notice_scope(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_guardian_absence_notice_actor_integrity()','EXECUTE'),
  'absence actor helpers remain private'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.guardian_absence_notices'::regclass and tgname='guardian_absence_notice_submit_review_actor_integrity_trg' and not tgisinternal),
  1,
  'absence actor integrity trigger is installed once'
);

select * from finish();
rollback;
