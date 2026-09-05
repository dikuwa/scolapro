begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fee00000-0000-4000-8000-000000000001','snapshot-actor-admin@example.test','authenticated','authenticated',now(),now()),
  ('fee00000-0000-4000-8000-000000000002','snapshot-actor-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fee00000-0000-4000-8000-000000000003','snapshot-actor-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fee00000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fee00000-0000-4000-8000-000000000002','teacher',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fee00000-0000-4000-8000-000000000003','principal',current_date-1);

select lives_ok(
  $$insert into public.report_card_snapshots(
      id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
      template_version,snapshot_version,data_snapshot,status,generated_by_user_id
    ) values(
      'fee10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      2026,1,'SNAPSHOT_ACTOR_TEST',992,'{}'::jsonb,'draft','fee00000-0000-4000-8000-000000000001'
    )$$,
  'trusted writer accepts an authorized report-card generator'
);

select throws_ok(
  $$insert into public.report_card_snapshots(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
      template_version,snapshot_version,data_snapshot,status,generated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      2026,2,'FORGED_TEACHER',992,'{}'::jsonb,'draft','fee00000-0000-4000-8000-000000000002'
    )$$,
  'Report-card snapshot generator is not authorized for school',
  'trusted writer cannot attribute snapshot generation to an ordinary teacher'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fee00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$insert into public.report_card_snapshots(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
      template_version,snapshot_version,data_snapshot,status,generated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      2026,3,'SPOOFED_GENERATOR',992,'{}'::jsonb,'draft','fee00000-0000-4000-8000-000000000003'
    )$$,
  'Report-card snapshot generator must match authenticated actor',
  'authenticated manager cannot spoof another authorized generator'
);

select throws_ok(
  $$update public.report_card_snapshots
    set status='published'
    where id='fee10000-0000-4000-8000-000000000001'$$,
  'Draft report-card snapshot must be certified before publication',
  'draft snapshot cannot bypass certification and publish directly'
);

select throws_ok(
  $$update public.report_card_snapshots
    set generated_by_user_id='fee00000-0000-4000-8000-000000000003'
    where id='fee10000-0000-4000-8000-000000000001'$$,
  'Report-card snapshot generation provenance is immutable',
  'draft snapshot generator provenance is immutable before certification too'
);

select throws_ok(
  $$update public.report_card_snapshots
    set status='certified',certified_by_user_id='fee00000-0000-4000-8000-000000000003',certified_at=now()
    where id='fee10000-0000-4000-8000-000000000001'$$,
  'Report-card snapshot certifier must match authenticated actor',
  'authenticated manager cannot spoof a different authorized certifier'
);

set local role authenticated;
select lives_ok(
  $$select public.certify_report_card_snapshot('fee10000-0000-4000-8000-000000000001')$$,
  'governed certification RPC remains usable by the authorized school administrator'
);
reset role;

select is(
  (select certified_by_user_id from public.report_card_snapshots where id='fee10000-0000-4000-8000-000000000001'),
  'fee00000-0000-4000-8000-000000000001'::uuid,
  'certification preserves the authenticated management actor'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_report_card_snapshot_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_snapshot_actor_integrity()','EXECUTE')
  and (select count(*)=1 from pg_trigger
       where tgrelid='public.report_card_snapshots'::regclass
         and tgname='zz_report_card_snapshot_actor_integrity_trg'
         and not tgisinternal),
  'snapshot actor-integrity helper is private and its physical guard is installed once'
);

select * from finish();
rollback;
