begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('eb000000-0000-4000-8000-000000000001','network-circuit@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000002','network-region@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000003','network-other-region@example.test','authenticated','authenticated',now(),now()),
  ('eb000000-0000-4000-8000-000000000004','network-expired@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('eb100000-0000-4000-8000-000000000001','Network test tenant','network-test-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values(
  'eb110000-0000-4000-8000-000000000001',
  'eb100000-0000-4000-8000-000000000001',
  'Out of scope school',
  'LEGACY-TEST-EMIS',
  'Legacy Region',
  'Legacy Town',
  'active'
);

insert into public.education_authorities(id,name)
values('eb200000-0000-4000-8000-000000000001','Test education authority');

insert into public.education_regions(id,name)
values
  ('eb210000-0000-4000-8000-000000000001','Test region one'),
  ('eb210000-0000-4000-8000-000000000002','Test region two');

insert into public.education_circuits(id,name)
values
  ('eb220000-0000-4000-8000-000000000001','Test circuit one'),
  ('eb220000-0000-4000-8000-000000000002','Test circuit two');

insert into public.education_clusters(id,name)
values('eb230000-0000-4000-8000-000000000001','Test cluster one');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values
  ('eb300000-0000-4000-8000-000000000001','eb210000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','2020-01-01'),
  ('eb300000-0000-4000-8000-000000000002','eb210000-0000-4000-8000-000000000002','eb200000-0000-4000-8000-000000000001','2020-01-01');

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values
  ('eb310000-0000-4000-8000-000000000001','eb220000-0000-4000-8000-000000000001','eb210000-0000-4000-8000-000000000001','2020-01-01'),
  ('eb310000-0000-4000-8000-000000000002','eb220000-0000-4000-8000-000000000002','eb210000-0000-4000-8000-000000000002','2020-01-01');

insert into public.education_cluster_circuit_history(id,cluster_id,circuit_id,effective_from)
values('eb320000-0000-4000-8000-000000000001','eb230000-0000-4000-8000-000000000001','eb220000-0000-4000-8000-000000000001','2020-01-01');

insert into public.school_network_assignments(
  id,school_id,authority_id,region_id,circuit_id,cluster_id,effective_from
) values(
  'eb400000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'eb200000-0000-4000-8000-000000000001',
  'eb210000-0000-4000-8000-000000000001',
  'eb220000-0000-4000-8000-000000000001',
  'eb230000-0000-4000-8000-000000000001',
  '2020-01-01'
);

select is(
  (select count(*)::integer from public.school_network_assignments where id='eb400000-0000-4000-8000-000000000001'),
  1,
  'consistent authority-region-circuit-cluster school hierarchy is accepted'
);

select throws_ok(
  $$insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
    values('eb400000-0000-4000-8000-000000000002','eb110000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','eb210000-0000-4000-8000-000000000002','eb220000-0000-4000-8000-000000000001','2020-01-01')$$,
  'P0001',
  'School network hierarchy mismatch: circuit is not under region for the full assignment period',
  'school placement rejects a circuit/region hierarchy mismatch'
);

select throws_like(
  $$insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from,effective_to)
    values('eb310000-0000-4000-8000-000000000003','eb220000-0000-4000-8000-000000000001','eb210000-0000-4000-8000-000000000002','2024-01-01','2024-12-31')$$,
  '%conflicting key value violates exclusion constraint%',
  'effective hierarchy history cannot overlap for one circuit'
);

insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('eb500000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','circuit_officer','eb220000-0000-4000-8000-000000000001','2026-01-01');

insert into public.education_network_memberships(id,user_id,role_key,region_id,active_from,active_to)
values
  ('eb500000-0000-4000-8000-000000000002','eb000000-0000-4000-8000-000000000002','regional_officer','eb210000-0000-4000-8000-000000000001','2026-01-01',null),
  ('eb500000-0000-4000-8000-000000000003','eb000000-0000-4000-8000-000000000003','regional_officer','eb210000-0000-4000-8000-000000000002','2026-01-01',null),
  ('eb500000-0000-4000-8000-000000000004','eb000000-0000-4000-8000-000000000004','regional_officer','eb210000-0000-4000-8000-000000000001','2025-01-01','2025-12-31');

select throws_like(
  $$insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
    values('eb500000-0000-4000-8000-000000000005','eb000000-0000-4000-8000-000000000001','circuit_officer','eb220000-0000-4000-8000-000000000001','2026-06-01')$$,
  '%conflicting key value violates exclusion constraint%',
  'overlapping effective membership for the same user and network scope is rejected'
);

insert into public.school_external_identifiers(
  id,school_id,identifier_scheme,identifier_value,registry_url,effective_from,effective_to
) values(
  'eb600000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
  'emis','TEST-OLD',null,'2020-01-01','2025-12-31'
),(
  'eb600000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',
  'emis','TEST-CURRENT','https://registry.example.test/schools/TEST-CURRENT','2026-01-01',null
);

select is(
  (select count(*)::integer from public.school_external_identifiers where school_id='22222222-2222-4222-8222-222222222222' and identifier_scheme='emis'),
  2,
  'non-overlapping identifier versions preserve historical values'
);

select throws_like(
  $$insert into public.school_external_identifiers(id,school_id,identifier_scheme,identifier_value,effective_from)
    values('eb600000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','emis','TEST-OVERLAP','2026-06-01')$$,
  '%conflicting key value violates exclusion constraint%',
  'one school cannot have overlapping versions of the same identifier scheme'
);

select throws_like(
  $$insert into public.school_external_identifiers(id,school_id,identifier_scheme,identifier_value,effective_from)
    values('eb600000-0000-4000-8000-000000000004','eb110000-0000-4000-8000-000000000001','emis','TEST-CURRENT','2026-01-01')$$,
  '%conflicting key value violates exclusion constraint%',
  'the same governed identifier cannot be assigned to different schools in overlapping periods'
);

select ok(
  (select count(*) > 0 from public.audit_events where event_type like 'education_network.%' and entity_type='school_network_assignments'),
  'governed network mutations are written to the canonical audit_events ledger'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_view_school_via_network('22222222-2222-4222-8222-222222222222',current_date),
  true,
  'current circuit membership resolves in-scope school visibility'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.schools where id='22222222-2222-4222-8222-222222222222'),
  1,
  'circuit officer can read the in-scope school directory row through RLS'
);
select is(
  (select count(*)::integer from public.schools where id='eb110000-0000-4000-8000-000000000001'),
  0,
  'circuit officer cannot read an out-of-scope school'
);
select is(
  (select count(*)::integer from public.learners),
  0,
  'network school visibility does not grant learner identity access'
);
select is(
  (select count(*)::integer from public.enrolments),
  0,
  'network school visibility does not grant learner enrolment access'
);
select is(
  (select count(*)::integer from public.education_network_memberships),
  1,
  'network member can read only their own network membership row'
);
reset role;

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_view_school_via_network('22222222-2222-4222-8222-222222222222',current_date),
  true,
  'regional membership resolves schools assigned to that region'
);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_view_school_via_network('22222222-2222-4222-8222-222222222222',current_date),
  false,
  'regional membership does not cross into another region'
);

select set_config('request.jwt.claim.sub','eb000000-0000-4000-8000-000000000004',true);
select is(
  app_private.can_view_school_via_network('22222222-2222-4222-8222-222222222222',current_date),
  false,
  'expired network membership grants no current school visibility'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname='public'
     and tablename in ('learners','enrolments','staff_members')
     and (coalesce(qual,'') ilike '%can_view_school_via_network%'
          or coalesce(with_check,'') ilike '%can_view_school_via_network%')),
  0,
  'network helper is not attached to learner, enrolment, or staff-sensitive RLS policies'
);

select is(
  (select emis_number from public.schools where id='eb110000-0000-4000-8000-000000000001'),
  'LEGACY-TEST-EMIS'::text,
  'legacy bare EMIS field remains independent from governed identifier history'
);

select * from finish();
rollback;
