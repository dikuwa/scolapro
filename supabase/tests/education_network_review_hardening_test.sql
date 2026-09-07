begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ec000000-0000-4000-8000-000000000001','network-review-user@example.test','authenticated','authenticated',now(),now()),
  ('ec000000-0000-4000-8000-000000000002','network-review-admin@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(id,user_id,role_key,active_from)
values('ec010000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000002','platform_admin','2026-01-01');

insert into public.education_authorities(id,name)
values('ec100000-0000-4000-8000-000000000001','Review authority');

insert into public.education_regions(id,name)
values('ec110000-0000-4000-8000-000000000001','Review region');

insert into public.education_circuits(id,name)
values('ec120000-0000-4000-8000-000000000001','Review circuit');

insert into public.education_clusters(id,name)
values('ec130000-0000-4000-8000-000000000001','Review cluster');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('ec200000-0000-4000-8000-000000000001','ec110000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','2020-01-01');

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('ec210000-0000-4000-8000-000000000001','ec120000-0000-4000-8000-000000000001','ec110000-0000-4000-8000-000000000001','2020-01-01');

insert into public.education_cluster_circuit_history(id,cluster_id,circuit_id,effective_from)
values('ec220000-0000-4000-8000-000000000001','ec130000-0000-4000-8000-000000000001','ec120000-0000-4000-8000-000000000001','2020-01-01');

insert into public.school_network_assignments(
  id,school_id,authority_id,region_id,circuit_id,cluster_id,effective_from
) values(
  'ec300000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'ec100000-0000-4000-8000-000000000001',
  'ec110000-0000-4000-8000-000000000001',
  'ec120000-0000-4000-8000-000000000001',
  'ec130000-0000-4000-8000-000000000001',
  '2020-01-01'
);

insert into public.education_network_memberships(id,user_id,role_key,circuit_id,active_from)
values('ec310000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001','circuit_officer','ec120000-0000-4000-8000-000000000001','2026-01-01');

select throws_like(
  $$update public.education_region_authority_history
      set effective_to='2025-12-31'
    where id='ec200000-0000-4000-8000-000000000001'$$,
  'Hierarchy history mutation would invalidate school network assignment for school %',
  'region-authority history cannot be retired while an overlapping school assignment depends on it'
);

select throws_like(
  $$update public.education_circuit_region_history
      set effective_to='2025-12-31'
    where id='ec210000-0000-4000-8000-000000000001'$$,
  'Hierarchy history mutation would invalidate school network assignment for school %',
  'circuit-region history cannot be retired while an overlapping school assignment depends on it'
);

select throws_like(
  $$delete from public.education_cluster_circuit_history
    where id='ec220000-0000-4000-8000-000000000001'$$,
  'Hierarchy history mutation would invalidate school network assignment for school %',
  'cluster-circuit history cannot be deleted while an overlapping school assignment depends on it'
);

select throws_like(
  $$insert into public.school_external_identifiers(
      id,school_id,identifier_scheme,identifier_value,effective_from
    ) values(
      'ec400000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222',
      'emis',
      ' TEST-CURRENT ',
      '2030-01-01'
    )$$,
  '%school_external_identifiers_value_trimmed%',
  'external identifier values with surrounding whitespace are rejected before uniqueness enforcement'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.audit_events
    where school_id is null and tenant_id is null and event_type like 'education_network.%'),
  0,
  'ordinary network users cannot read global education-network audit events'
);
reset role;

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select ok(
  (select count(*) > 0 from public.audit_events
    where school_id is null and tenant_id is null and event_type like 'education_network.%'),
  'platform admin can read global education-network audit events'
);
reset role;

select * from finish();
rollback;
