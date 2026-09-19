begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('53700000-0000-4000-8000-000000000001','import-current-admin@example.test','authenticated','authenticated',now(),now()),
('53700000-0000-4000-8000-000000000002','import-stale-admin@example.test','authenticated','authenticated',now(),now()),
('53700000-0000-4000-8000-000000000003','import-support-admin@example.test','authenticated','authenticated',now(),now()),
('53700000-0000-4000-8000-000000000004','import-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('53710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Import Later School','IMP-537-LATER','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53700000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53700000-0000-4000-8000-000000000002','school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','53710000-0000-4000-8000-000000000001','53700000-0000-4000-8000-000000000002','teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','53700000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.platform_memberships(user_id,role_key,active_from) values
('53700000-0000-4000-8000-000000000003','platform_support',current_date),
('53700000-0000-4000-8000-000000000004','platform_admin',current_date);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id) values
('53720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','scope-learners.csv','ready','53700000-0000-4000-8000-000000000001'),
('53720000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','scope-staff.csv','ready','53700000-0000-4000-8000-000000000001'),
('53720000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','scope-guardians.csv','ready','53700000-0000-4000-8000-000000000001'),
('53720000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','learners','platform-learners.csv','ready','53700000-0000-4000-8000-000000000004');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','53700000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.commit_learner_import_batch('53720000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied',
  'stale non-current school admin cannot enter learner import commit'
);
select throws_ok(
  $$select public.commit_staff_import_batch('53720000-0000-4000-8000-000000000002')$$,
  'P0001','Permission denied',
  'stale non-current school admin cannot enter staff import commit'
);
select throws_ok(
  $$select public.commit_guardian_import_batch('53720000-0000-4000-8000-000000000003')$$,
  'P0001','Permission denied',
  'stale non-current school admin cannot enter guardian import commit'
);
reset role;

select set_config('request.jwt.claim.sub','53700000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.commit_learner_import_batch('53720000-0000-4000-8000-000000000001')$$,
  'P0001','Permission denied',
  'Platform Support cannot enter learner import commit even with school_admin membership'
);
select throws_ok(
  $$select public.commit_staff_import_batch('53720000-0000-4000-8000-000000000002')$$,
  'P0001','Permission denied',
  'Platform Support cannot enter staff import commit even with school_admin membership'
);
select throws_ok(
  $$select public.commit_guardian_import_batch('53720000-0000-4000-8000-000000000003')$$,
  'P0001','Permission denied',
  'Platform Support cannot enter guardian import commit even with school_admin membership'
);
reset role;

select set_config('request.jwt.claim.sub','53700000-0000-4000-8000-000000000004',true);
set local role authenticated;
select lives_ok(
  $$select public.commit_learner_import_batch('53720000-0000-4000-8000-000000000004')$$,
  'governed Platform Admin authority can commit an otherwise valid learner batch'
);
reset role;

select is(
  (select status from public.import_batches where id='53720000-0000-4000-8000-000000000004'),
  'completed',
  'Platform Admin commit reaches the canonical completed terminal state'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_import_commit_authority()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_import_commit_authority()','EXECUTE'),
  'commit authority trigger helper remains private'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.import_batches'::regclass
      and tgname='import_batch_commit_authority_trg'
      and not tgisinternal
  ),
  'import commit authority trigger is installed'
);

select * from finish();
rollback;
