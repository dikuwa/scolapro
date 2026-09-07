begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('e5100000-0000-4000-8000-000000000001','statutory-principal@example.test','authenticated','authenticated',now(),now()),
  ('e5100000-0000-4000-8000-000000000002','statutory-circuit@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values(
  'e5110000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'e5100000-0000-4000-8000-000000000001',
  'principal',
  current_date - 30
);

insert into public.education_authorities(id,name)
values('e5120000-0000-4000-8000-000000000001','N05 test authority');
insert into public.education_regions(id,name)
values('e5130000-0000-4000-8000-000000000001','N05 test region');
insert into public.education_circuits(id,name)
values('e5140000-0000-4000-8000-000000000001','N05 test circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('e5150000-0000-4000-8000-000000000001','e5130000-0000-4000-8000-000000000001','e5120000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('e5160000-0000-4000-8000-000000000001','e5140000-0000-4000-8000-000000000001','e5130000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values(
  'e5170000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'e5120000-0000-4000-8000-000000000001',
  'e5130000-0000-4000-8000-000000000001',
  'e5140000-0000-4000-8000-000000000001',
  '2020-01-01'
);
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('e5180000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000002','circuit_officer','e5140000-0000-4000-8000-000000000001',current_date - 30);

insert into public.tenants(id,name,slug,status)
values('e5190000-0000-4000-8000-000000000001','N05 other tenant','n05-other-tenant','active');
insert into public.schools(id,tenant_id,name,status)
values('e5191000-0000-4000-8000-000000000001','e5190000-0000-4000-8000-000000000001','N05 out-of-scope school','active');

insert into public.statutory_form_definitions(id,form_key,display_name,authority,active)
values('e5200000-0000-4000-8000-000000000001','n05-test-form','N05 test form','Test authority',true);
insert into public.statutory_form_versions(id,form_definition_id,version_key,effective_from,source_reference,mapping_schema,status)
values(
  'e5210000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001',
  'test-v1',
  '2026-01-01',
  'TEST-ONLY-N05',
  '{"fields":[]}'::jsonb,
  'approved'
);

insert into public.statutory_reporting_cycles(id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id)
values
  ('e5220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e5210000-0000-4000-8000-000000000001',2026,'N05-TEST','2026-02-15','review','e5100000-0000-4000-8000-000000000001'),
  ('e5220000-0000-4000-8000-000000000002','e5190000-0000-4000-8000-000000000001','e5191000-0000-4000-8000-000000000001','e5210000-0000-4000-8000-000000000001',2026,'N05-OTHER','2026-02-15','review','e5100000-0000-4000-8000-000000000001');

insert into public.statutory_snapshots(id,tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id,status)
values(
  'e5230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e5220000-0000-4000-8000-000000000001',1,'{"count":1}'::jsonb,'{}'::jsonb,'e5100000-0000-4000-8000-000000000001','reviewed'
);
insert into public.statutory_readiness_issues(id,tenant_id,school_id,reporting_cycle_id,issue_code,severity,message,resolved)
values
  ('e5240000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e5220000-0000-4000-8000-000000000001','N05_BLOCK','blocking','Blocking test issue',false),
  ('e5240000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e5220000-0000-4000-8000-000000000001','N05_WARN','warning','Warning test issue',false);
insert into public.statutory_mapping_runs(id,tenant_id,school_id,reporting_cycle_id,snapshot_id,form_version_id,mapping_schema_snapshot,mapped_values,issues,blocking_issue_count,status,compiled_by_user_id)
values('e5250000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e5220000-0000-4000-8000-000000000001','e5230000-0000-4000-8000-000000000001','e5210000-0000-4000-8000-000000000001','{"fields":[]}'::jsonb,'{}'::jsonb,'[]'::jsonb,0,'compiled','e5100000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5100000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is((select count(*)::integer from public.statutory_reporting_cycles),1,'circuit reviewer sees only the in-scope reporting cycle');
select is((select count(*)::integer from public.statutory_snapshots),1,'circuit reviewer sees the in-scope generated snapshot');
select is((select count(*)::integer from public.statutory_readiness_issues where severity='blocking'),1,'blocking readiness issues remain explicitly distinguishable');
select is((select count(*)::integer from public.statutory_readiness_issues where severity='warning'),1,'warning readiness issues remain explicitly distinguishable');
select is((select count(*)::integer from public.statutory_mapping_runs),1,'circuit reviewer can inspect the in-scope compiler result');
select throws_ok($$select public.compile_statutory_mapping('e5230000-0000-4000-8000-000000000001')$$,'P0001','Permission denied','network review scope cannot compile statutory mappings');
select throws_ok($$select public.certify_statutory_snapshot('e5230000-0000-4000-8000-000000000001','principal',null)$$,'P0001','Certification role does not match your active school role','network review scope cannot impersonate a school certifier');
reset role;

select set_config('request.jwt.claim.sub','e5100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.certify_statutory_snapshot('e5230000-0000-4000-8000-000000000001','principal',null)$$,'P0001','Blocking statutory readiness issues must be resolved before certification','blocking readiness prevents school certification');
reset role;

update public.statutory_readiness_issues set resolved=true,resolved_at=now() where id='e5240000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(public.certify_statutory_snapshot('e5230000-0000-4000-8000-000000000001','principal','N05 test certification') is not null,'warnings do not prevent governed certification after blockers are resolved');
reset role;

select throws_ok($$update public.statutory_snapshots set values='{"count":2}'::jsonb where id='e5230000-0000-4000-8000-000000000001'$$,'P0001','Statutory snapshot payload and provenance are immutable','certified historical snapshot payload remains immutable');

select * from finish();
rollback;
