begin;

select plan(8);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history','examination_candidate_centre_assignments','school_examination_centre_assignments') and cmd='ALL'),
  0,
  'target registry/exam tables have no remaining ALL policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history','examination_candidate_centre_assignments','school_examination_centre_assignments')
     and cmd in ('INSERT','UPDATE','DELETE')
     and policyname like '% [insert]' or false),
  15,
  'all fifteen targets have command-specific insert policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history','examination_candidate_centre_assignments','school_examination_centre_assignments')
     and cmd='UPDATE' and policyname like '% [update]'),
  15,
  'all fifteen targets have command-specific update policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history','examination_candidate_centre_assignments','school_examination_centre_assignments')
     and cmd='DELETE' and policyname like '% [delete]'),
  15,
  'all fifteen targets have command-specific delete policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history','examination_candidate_centre_assignments','school_examination_centre_assignments') and cmd='SELECT'),
  15,
  'all fifteen dedicated read policies remain present'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename in ('education_authorities','education_regions','education_region_authority_history','education_circuits','education_circuit_region_history','education_clusters','education_cluster_circuit_history','education_network_memberships','school_external_identifiers','school_network_assignments','examination_centres','examination_centre_identifier_history','examination_centre_status_history')
     and cmd in ('INSERT','UPDATE','DELETE')
     and coalesce(qual,with_check,'') like '%has_platform_role%'),
  39,
  'platform-managed tables preserve platform-admin write predicates'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename in ('examination_candidate_centre_assignments','school_examination_centre_assignments')
     and cmd in ('INSERT','UPDATE','DELETE')
     and coalesce(qual,with_check,'') like '%can_manage_examinations%'),
  6,
  'school examination assignment tables preserve examination-management predicates'
);

select ok(
  (select qual like '%has_platform_role%' or qual = 'true'
   from pg_policies
   where schemaname='public'
     and tablename='education_network_memberships'
     and policyname='education_network_memberships_self_read'),
  'education network membership read policy still includes platform/self access'
);

select * from finish();
rollback;
