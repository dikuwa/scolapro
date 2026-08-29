begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f9000000-0000-4000-8000-000000000001','statutory-principal@example.test','authenticated','authenticated',now(),now()),
  ('f9000000-0000-4000-8000-000000000002','platform-support-statutory@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9000000-0000-4000-8000-000000000001','principal',current_date);

insert into public.platform_memberships(user_id,role_key,active_from)
values('f9000000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.statutory_form_definitions(id,form_key,display_name,authority,active)
values('f9100000-0000-4000-8000-000000000001','INTEGRITY-TEST-FORM','Integrity Test Form','Test Authority',true);

insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,status
) values (
  'f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','1','2026-01-01','published'
);

insert into public.statutory_reporting_cycles(
  id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id
) values (
  'f9300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9200000-0000-4000-8000-000000000001',2026,'TERM3-INTEGRITY',current_date,'review','f9000000-0000-4000-8000-000000000001'
);

insert into public.statutory_snapshots(
  id,tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,
  generated_by_user_id,status
) values (
  'f9400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9300000-0000-4000-8000-000000000001',1,
  '{"learners":100,"reference_date":"2026-08-29"}'::jsonb,
  '{"generator":"integrity-test","source":"fixed"}'::jsonb,
  'f9000000-0000-4000-8000-000000000001','reviewed'
);

select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.certify_statutory_snapshot('f9400000-0000-4000-8000-000000000001','school_admin','Wrong role claim')$$,
  'Certification role does not match your active school role',
  'principal cannot self-certify using a school_admin role label'
);

select lives_ok(
  $$select public.certify_statutory_snapshot('f9400000-0000-4000-8000-000000000001','principal','I certify this fixed snapshot')$$,
  'actual principal can certify under the principal role'
);

select is(
  (select status from public.statutory_snapshots where id='f9400000-0000-4000-8000-000000000001'),
  'certified',
  'certification transitions the fixed snapshot to certified'
);

select is(
  (select certification_role from public.statutory_certifications where snapshot_id='f9400000-0000-4000-8000-000000000001'),
  'principal',
  'certification provenance records the signer actual role'
);

select throws_ok(
  $$update public.statutory_snapshots set values='{"learners":999}'::jsonb where id='f9400000-0000-4000-8000-000000000001'$$,
  'Statutory snapshot payload and provenance are immutable',
  'certified statutory values cannot be rewritten'
);

select throws_ok(
  $$delete from public.statutory_snapshots where id='f9400000-0000-4000-8000-000000000001'$$,
  'Reviewed or certified statutory snapshots cannot be deleted',
  'certified statutory evidence cannot be deleted'
);

select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_manage_statutory('22222222-2222-4222-8222-222222222222'),
  false,
  'platform support does not inherit statutory school-data authority'
);

select * from finish();
rollback;