begin;

select plan(21);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('d0700000-0000-4000-8000-000000000001','n07-manager@example.test','authenticated','authenticated',now(),now()),
  ('d0700000-0000-4000-8000-000000000002','n07-network@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('d0710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N07 School','N07-LEGACY','Legacy Region','N07 Town','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','d0700000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('d0720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N07-STAFF-1','N07','Staff','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'd0730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'd0710000-0000-4000-8000-000000000001','d0720000-0000-4000-8000-000000000001','staff','2026-01-01',
  'd0700000-0000-4000-8000-000000000001'
);

insert into public.staffing_establishment_posts(
  id,tenant_id,school_id,title,effective_from,created_by_user_id
) values
  ('d0740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','N07 Occupied Post','2026-01-01','d0700000-0000-4000-8000-000000000001'),
  ('d0740000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','N07 Vacant Post','2026-01-01','d0700000-0000-4000-8000-000000000001'),
  ('d0740000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','N07 Future Post','2026-08-01','d0700000-0000-4000-8000-000000000001');

insert into public.staffing_post_occupancies(
  id,tenant_id,school_id,post_id,staff_school_assignment_id,effective_from,created_by_user_id
) values(
  'd0750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001',
  'd0740000-0000-4000-8000-000000000001','d0730000-0000-4000-8000-000000000001','2026-02-01','d0700000-0000-4000-8000-000000000001'
);

insert into public.school_hostels(
  id,tenant_id,school_id,hostel_type,capacity,staff_count,active_from,created_by_user_id
) values
  ('d0760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','boarding',120,6,'2026-01-01','d0700000-0000-4000-8000-000000000001'),
  ('d0760000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','other',50,2,'2026-08-01','d0700000-0000-4000-8000-000000000001');

insert into public.school_feeding_programmes(
  id,tenant_id,school_id,programme_name,programme_type,active_from,target_beneficiaries,created_by_user_id
) values(
  'd0770000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001',
  'N07 Programme','school','2026-01-01',80,'d0700000-0000-4000-8000-000000000001'
);

insert into public.feeding_service_days(
  id,tenant_id,school_id,programme_id,service_date,beneficiary_count,meal_count,created_by_user_id
) values
  ('d0780000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','d0770000-0000-4000-8000-000000000001','2026-06-29',70,70,'d0700000-0000-4000-8000-000000000001'),
  ('d0780000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','d0770000-0000-4000-8000-000000000001','2026-06-30',75,75,'d0700000-0000-4000-8000-000000000001'),
  ('d0780000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','d0770000-0000-4000-8000-000000000001','2026-07-01',79,79,'d0700000-0000-4000-8000-000000000001');

insert into public.education_authorities(id,name,external_code)
values('d0790000-0000-4000-8000-000000000001','N07 Authority','N07-AUTH');
insert into public.education_regions(id,name,external_code)
values('d07a0000-0000-4000-8000-000000000001','N07 Region','N07-REG');
insert into public.education_circuits(id,name,external_code)
values('d07b0000-0000-4000-8000-000000000001','N07 Circuit','N07-CIR');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('d07c0000-0000-4000-8000-000000000001','d07a0000-0000-4000-8000-000000000001','d0790000-0000-4000-8000-000000000001','2026-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('d07d0000-0000-4000-8000-000000000001','d07b0000-0000-4000-8000-000000000001','d07a0000-0000-4000-8000-000000000001','2026-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values('d07e0000-0000-4000-8000-000000000001','d0710000-0000-4000-8000-000000000001','d0790000-0000-4000-8000-000000000001','d07a0000-0000-4000-8000-000000000001','d07b0000-0000-4000-8000-000000000001','2026-01-01');
insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('d07f0000-0000-4000-8000-000000000001','d0700000-0000-4000-8000-000000000002','circuit_officer','d07b0000-0000-4000-8000-000000000001','2026-01-01');

insert into public.school_external_identifiers(id,school_id,identifier_scheme,identifier_value,effective_from)
values
  ('d0800000-0000-4000-8000-000000000001','d0710000-0000-4000-8000-000000000001','emis','N07-EMIS-CANONICAL','2026-01-01'),
  ('d0800000-0000-4000-8000-000000000002','d0710000-0000-4000-8000-000000000001','registry','N07-FUTURE','2026-08-01');

insert into public.statutory_form_definitions(id,form_key,display_name,authority,active)
values('d0810000-0000-4000-8000-000000000001','N07-TEST','N07 Test Form','test-authority',true);
insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,field_schema,mapping_schema,validation_schema,status
) values(
  'd0820000-0000-4000-8000-000000000001','d0810000-0000-4000-8000-000000000001','v1','2026-01-01','{}'::jsonb,
  '{"fields":[{"source_path":["staffing_establishment","vacant_posts"],"target_path":["vacancies"],"expected_type":"number","required":true}]}'::jsonb,
  '{}'::jsonb,'published'
);
insert into public.statutory_reporting_cycles(
  id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id
) values(
  'd0830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001',
  'd0820000-0000-4000-8000-000000000001',2026,'N07-CYCLE','2026-06-30','open','d0700000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d0700000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.generate_statutory_snapshot('d0830000-0000-4000-8000-000000000001')$$,
  'N07 generates a snapshot from existing canonical operational sources'
);

select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{staffing_establishment,establishment_posts}')::integer,
  2,
  'reference-date staffing establishment excludes future posts'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{staffing_establishment,occupied_posts}')::integer,
  1,
  'snapshot reuses effective occupancy facts'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{staffing_establishment,vacant_posts}')::integer,
  1,
  'snapshot derives vacancy reconciliation rather than storing a vacancy fact'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{hostel_feeding,active_hostels}')::integer,
  1,
  'reference-date hostel aggregate excludes future hostel records'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{hostel_feeding,hostel_capacity}')::integer,
  120,
  'snapshot derives active hostel capacity from canonical hostel profiles'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{hostel_feeding,service_days_to_reference_date}')::integer,
  2,
  'feeding service-day aggregation stops at the reporting reference date'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{hostel_feeding,meals_served_to_reference_date}')::bigint,
  145::bigint,
  'snapshot reconciles cumulative meal counts only through the reference date'
);
select is(
  (select values#>>'{education_network,region,name}' from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1),
  'N07 Region'::text,
  'snapshot uses effective-dated normalized education-network placement'
);
select is(
  (select values#>>'{education_network,circuit,external_code}' from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1),
  'N07-CIR'::text,
  'snapshot preserves authoritative existing network code provenance without inventing a code'
);
select is(
  jsonb_array_length((select values->'school_external_identifiers' from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)),
  1,
  'reference-date external-school identifier snapshot excludes future identifiers'
);
select ok(
  not ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1) ? 'inclusion_support'),
  'network-visible statutory snapshot does not bypass N16 by embedding per-school inclusion/support aggregate detail'
);

select lives_ok(
  $$select public.compile_statutory_mapping((select id from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1))$$,
  'existing generic statutory compiler consumes the new operational source path without Ministry-specific code changes'
);
select is(
  ((select mapped_values from public.statutory_mapping_runs where snapshot_id=(select id from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1) order by compiled_at desc limit 1)#>>'{vacancies}')::integer,
  1,
  'mapping compiler reconciles declarative form mapping to N07 operational value'
);

reset role;

insert into public.staffing_establishment_posts(
  id,tenant_id,school_id,title,effective_from,created_by_user_id
) values(
  'd0740000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','d0710000-0000-4000-8000-000000000001','N07 Later Source Edit','2026-01-01','d0700000-0000-4000-8000-000000000001'
);

select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=1)#>>'{staffing_establishment,establishment_posts}')::integer,
  2,
  'later canonical source changes do not rewrite the frozen first snapshot'
);

select set_config('request.jwt.claim.sub','d0700000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.generate_statutory_snapshot('d0830000-0000-4000-8000-000000000001')$$,
  'open review cycle may create a new numbered snapshot after canonical source correction'
);
select is(
  ((select values from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=2)#>>'{staffing_establishment,establishment_posts}')::integer,
  3,
  'new snapshot captures corrected source state while preserving prior frozen snapshot'
);
select is(
  (select source_summary->>'generator' from public.statutory_snapshots where reporting_cycle_id='d0830000-0000-4000-8000-000000000001' and snapshot_number=2),
  'school-operational-v3'::text,
  'N07 extension preserves the existing statutory source generator contract'
);
reset role;

select set_config('request.jwt.claim.sub','d0700000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.statutory_snapshots where school_id='d0710000-0000-4000-8000-000000000001'),
  2,
  'authorized circuit reviewer retains N05 read-only visibility of statutory snapshot lifecycle'
);
select throws_ok(
  $$select * from public.school_inclusion_support_summary_as_of('d0710000-0000-4000-8000-000000000001','2026-06-30')$$,
  'Permission denied',
  'network statutory visibility does not grant the stricter per-school N16 inclusion aggregate surface'
);
select throws_ok(
  $$select app_private.build_n07_statutory_operational_extensions('d0710000-0000-4000-8000-000000000001',2026,'2026-06-30')$$,
  'permission denied for function build_n07_statutory_operational_extensions',
  'private N07 source builder is not directly executable by network roles'
);

select * from finish();
rollback;
