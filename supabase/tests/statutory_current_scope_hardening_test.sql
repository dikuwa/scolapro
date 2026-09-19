begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f4600000-0000-4000-8000-000000000001','stat-current@example.test','authenticated','authenticated',now(),now()),
  ('f4600000-0000-4000-8000-000000000002','stat-stale@example.test','authenticated','authenticated',now(),now()),
  ('f4600000-0000-4000-8000-000000000003','stat-support@example.test','authenticated','authenticated',now(),now()),
  ('f4600000-0000-4000-8000-000000000004','stat-platform@example.test','authenticated','authenticated',now(),now()),
  ('f4600000-0000-4000-8000-000000000005','stat-valid@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status) values
  ('f4610000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Statutory QA Old School','active'),
  ('f4610000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Statutory QA Current School','active'),
  ('f4610000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Statutory QA Stale School','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('f4620000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f4600000-0000-4000-8000-000000000002','STAT-STALE','Stale','Statutory','active'),
  ('f4620000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f4600000-0000-4000-8000-000000000005','STAT-VALID','Valid','Statutory','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('f4630000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000003','f4620000-0000-4000-8000-000000000001','management',current_date-30,current_date-1,'f4600000-0000-4000-8000-000000000002'),
  ('f4630000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000001','f4620000-0000-4000-8000-000000000002','management',current_date-30,null,'f4600000-0000-4000-8000-000000000005');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('f4640000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000001','f4600000-0000-4000-8000-000000000001',null,'principal',current_date-20),
  ('f4640000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000002','f4600000-0000-4000-8000-000000000001',null,'teacher',current_date-1),
  ('f4640000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000003','f4600000-0000-4000-8000-000000000002','f4620000-0000-4000-8000-000000000001','principal',current_date-10),
  ('f4640000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','f4610000-0000-4000-8000-000000000001','f4600000-0000-4000-8000-000000000005','f4620000-0000-4000-8000-000000000002','principal',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('f4600000-0000-4000-8000-000000000003','platform_support',current_date-10),
  ('f4600000-0000-4000-8000-000000000004','platform_admin',current_date-10);

insert into public.statutory_form_definitions(id,form_key,display_name,authority,active)
values('f4650000-0000-4000-8000-000000000001','STAT-QA-CURRENT','Statutory QA Generic Form','Test authority',true);

insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,source_reference,mapping_schema,status
) values(
  'f4660000-0000-4000-8000-000000000001','f4650000-0000-4000-8000-000000000001','qa-v1',
  current_date-30,'TEST-ONLY-STATUTORY-QA','{"fields":[]}'::jsonb,'published'
);

insert into public.statutory_reporting_cycles(
  id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id
) values(
  'f4670000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f4610000-0000-4000-8000-000000000001','f4660000-0000-4000-8000-000000000001',
  2026,'STAT-QA-CYCLE',current_date,'review','f4600000-0000-4000-8000-000000000005'
);

insert into public.statutory_snapshots(
  id,tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id,status
) values(
  'f4680000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f4610000-0000-4000-8000-000000000001','f4670000-0000-4000-8000-000000000001',
  1,'{"aggregate_count":1}'::jsonb,'{"generator":"test"}'::jsonb,'f4600000-0000-4000-8000-000000000005','reviewed'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000001'),false,'older active non-current school membership cannot prepare statutory state');
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000002'),false,'current school without a statutory preparation role does not gain preparation authority');
select throws_ok(
  $$select public.certify_statutory_snapshot('f4680000-0000-4000-8000-000000000001','principal',null)$$,
  'P0001',
  'Certification role does not match your current effective school role',
  'older active non-current principal cannot certify historical school scope'
);
reset role;

select set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000003'),false,'ended linked staff placement denies statutory preparation authority');
reset role;

select set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000001'),false,'Platform Support has no statutory preparation override');
reset role;

select set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000001'),true,'Platform Admin retains governed statutory preparation authority');
reset role;

select set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(app_private.can_manage_statutory('f4610000-0000-4000-8000-000000000001'),true,'current principal with effective linked placement can prepare statutory state');
select ok(
  public.certify_statutory_snapshot('f4680000-0000-4000-8000-000000000001','principal','QA certification') is not null,
  'current effective principal can certify through the existing governed lifecycle'
);
reset role;

select is(
  (select status from public.statutory_snapshots where id='f4680000-0000-4000-8000-000000000001'),
  'certified',
  'successful certification advances only lifecycle state while snapshot payload remains fixed'
);

select throws_ok(
  $$update public.statutory_snapshots set values='{"aggregate_count":2}'::jsonb where id='f4680000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Statutory snapshot payload and provenance are immutable',
  'certified historical snapshot payload remains immutable'
);

select * from finish();
rollback;
