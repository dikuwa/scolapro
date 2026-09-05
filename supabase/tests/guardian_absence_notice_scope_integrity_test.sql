begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe700000-0000-4000-8000-000000000001','guardian-absence-scope-a@example.test','authenticated','authenticated',now(),now()),
  ('fe700000-0000-4000-8000-000000000002','guardian-absence-scope-b@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe700000-0000-4000-8000-000000000002','counsellor',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values('fe710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Absence','Learner A');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fe720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values
  ('fe730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian','One'),
  ('fe730000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Guardian','Two');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values('fe740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe710000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001',1,'2026-01-01');

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values('fe750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001');

insert into public.tenants(id,name,slug)
values('fe800000-0000-4000-8000-000000000001','Guardian Absence Scope Tenant B','guardian-absence-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fe810000-0000-4000-8000-000000000001','fe800000-0000-4000-8000-000000000001','Guardian Absence Scope School B','GAS-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname)
values('fe820000-0000-4000-8000-000000000001','fe800000-0000-4000-8000-000000000001','Absence','Learner B');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('fe830000-0000-4000-8000-000000000001','fe800000-0000-4000-8000-000000000001','fe810000-0000-4000-8000-000000000001','fe820000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('fe840000-0000-4000-8000-000000000001','fe800000-0000-4000-8000-000000000001','Guardian','B');

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('fe800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: school does not belong to tenant',
  'absence notice tenant must match school tenant'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe820000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: learner does not belong to tenant',
  'absence notice learner must match tenant'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe830000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: enrolment does not match notice scope',
  'absence notice enrolment must match tenant school and learner'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe840000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: guardian does not belong to tenant',
  'absence notice guardian must match tenant'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000002','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: guardian is not linked to learner',
  'absence notice guardian must be linked to learner'
);

select throws_ok(
  $$insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000002','2026-02-01','2026-02-02')$$,
  'Guardian absence notice scope mismatch: submitter is not linked to guardian',
  'absence notice submitter must be linked to guardian account'
);

select lives_ok(
  $$insert into public.guardian_absence_notices(id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to,message)
    values('fe850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','2026-02-01','2026-02-02','Illness')$$,
  'valid guardian absence notice remains allowed'
);

select lives_ok(
  $$update public.guardian_absence_notices set status='under_review', review_note='Received', reviewed_at=now(), reviewed_by_user_id='fe700000-0000-4000-8000-000000000002' where id='fe850000-0000-4000-8000-000000000001'$$,
  'normal absence notice review lifecycle updates remain allowed for authorized reviewer'
);

select throws_ok(
  $$update public.guardian_absence_notices set guardian_id='fe730000-0000-4000-8000-000000000002' where id='fe850000-0000-4000-8000-000000000001'$$,
  'Guardian absence notice tenant, school, learner, enrolment, guardian, and submitter are immutable',
  'absence notice provenance cannot be rewritten after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_guardian_absence_notice_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_guardian_absence_notice_scope_integrity()','EXECUTE'),
  'guardian absence notice integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.guardian_absence_notices'::regclass and tgname='guardian_absence_notice_scope_integrity_trg' and not tgisinternal),
  1,
  'guardian absence notices have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
