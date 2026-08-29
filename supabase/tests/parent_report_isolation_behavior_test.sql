begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f8000000-0000-4000-8000-000000000001','parent-report-isolation@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('f8100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report','Guardian','PARENT-RPT-001');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('f8200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','parent',true,current_date-10);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('f8300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f8100000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id,published_at
)
values
  ('f8400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'TEST',1,'{}','published','f8000000-0000-4000-8000-000000000001',now()),
  ('f8400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,2,'TEST',1,'{}','draft','f8000000-0000-4000-8000-000000000001',null),
  ('f8400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',2026,1,'TEST',1,'{}','published','f8000000-0000-4000-8000-000000000001',now());

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.report_card_snapshots),
  1,
  'parent sees only published snapshots for actively linked learners'
);

select is(
  (select id from public.report_card_snapshots),
  'f8400000-0000-4000-8000-000000000001'::uuid,
  'parent sees the exact published snapshot for the linked learner'
);

reset role;
update public.learner_guardians set effective_to=current_date-1 where id='f8200000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select count(*)::integer from public.report_card_snapshots),
  0,
  'ending the guardian relationship removes report access immediately'
);

select results_eq(
  $$update public.report_card_snapshots set data_snapshot='{"tampered":true}'::jsonb where id='f8400000-0000-4000-8000-000000000001' returning id$$,
  ARRAY[]::uuid[],
  'parent cannot mutate a published report snapshot'
);

reset role;
select * from finish();
rollback;
