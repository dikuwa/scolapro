-- #925: split management FOR ALL policies into write-only commands.
-- Dedicated SELECT policies already preserve manager read access.
-- Predicates are unchanged; this removes only redundant SELECT branches.

drop policy if exists "education_authorities_platform_write" on public.education_authorities;

create policy "education_authorities_platform_write [insert]"
on public.education_authorities
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_authorities_platform_write [update]"
on public.education_authorities
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_authorities_platform_write [delete]"
on public.education_authorities
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_regions_platform_write" on public.education_regions;

create policy "education_regions_platform_write [insert]"
on public.education_regions
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_regions_platform_write [update]"
on public.education_regions
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_regions_platform_write [delete]"
on public.education_regions
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_region_authority_history_platform_write" on public.education_region_authority_history;

create policy "education_region_authority_history_platform_write [insert]"
on public.education_region_authority_history
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_region_authority_history_platform_write [update]"
on public.education_region_authority_history
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_region_authority_history_platform_write [delete]"
on public.education_region_authority_history
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_circuits_platform_write" on public.education_circuits;

create policy "education_circuits_platform_write [insert]"
on public.education_circuits
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_circuits_platform_write [update]"
on public.education_circuits
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_circuits_platform_write [delete]"
on public.education_circuits
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_circuit_region_history_platform_write" on public.education_circuit_region_history;

create policy "education_circuit_region_history_platform_write [insert]"
on public.education_circuit_region_history
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_circuit_region_history_platform_write [update]"
on public.education_circuit_region_history
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_circuit_region_history_platform_write [delete]"
on public.education_circuit_region_history
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_clusters_platform_write" on public.education_clusters;

create policy "education_clusters_platform_write [insert]"
on public.education_clusters
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_clusters_platform_write [update]"
on public.education_clusters
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_clusters_platform_write [delete]"
on public.education_clusters
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_cluster_circuit_history_platform_write" on public.education_cluster_circuit_history;

create policy "education_cluster_circuit_history_platform_write [insert]"
on public.education_cluster_circuit_history
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_cluster_circuit_history_platform_write [update]"
on public.education_cluster_circuit_history
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_cluster_circuit_history_platform_write [delete]"
on public.education_cluster_circuit_history
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "education_network_memberships_platform_write" on public.education_network_memberships;

create policy "education_network_memberships_platform_write [insert]"
on public.education_network_memberships
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_network_memberships_platform_write [update]"
on public.education_network_memberships
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "education_network_memberships_platform_write [delete]"
on public.education_network_memberships
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "school_external_identifiers_platform_write" on public.school_external_identifiers;

create policy "school_external_identifiers_platform_write [insert]"
on public.school_external_identifiers
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "school_external_identifiers_platform_write [update]"
on public.school_external_identifiers
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "school_external_identifiers_platform_write [delete]"
on public.school_external_identifiers
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "school_network_assignments_platform_write" on public.school_network_assignments;

create policy "school_network_assignments_platform_write [insert]"
on public.school_network_assignments
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "school_network_assignments_platform_write [update]"
on public.school_network_assignments
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "school_network_assignments_platform_write [delete]"
on public.school_network_assignments
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "examination_centres_platform_manage" on public.examination_centres;

create policy "examination_centres_platform_manage [insert]"
on public.examination_centres
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centres_platform_manage [update]"
on public.examination_centres
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centres_platform_manage [delete]"
on public.examination_centres
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "examination_centre_identifier_platform_manage" on public.examination_centre_identifier_history;

create policy "examination_centre_identifier_platform_manage [insert]"
on public.examination_centre_identifier_history
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centre_identifier_platform_manage [update]"
on public.examination_centre_identifier_history
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centre_identifier_platform_manage [delete]"
on public.examination_centre_identifier_history
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "examination_centre_status_platform_manage" on public.examination_centre_status_history;

create policy "examination_centre_status_platform_manage [insert]"
on public.examination_centre_status_history
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centre_status_platform_manage [update]"
on public.examination_centre_status_history
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "examination_centre_status_platform_manage [delete]"
on public.examination_centre_status_history
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "examination_candidate_centre_assignment_manage" on public.examination_candidate_centre_assignments;

create policy "examination_candidate_centre_assignment_manage [insert]"
on public.examination_candidate_centre_assignments
for insert to authenticated
with check (app_private.can_manage_examinations(school_id));

create policy "examination_candidate_centre_assignment_manage [update]"
on public.examination_candidate_centre_assignments
for update to authenticated
using (app_private.can_manage_examinations(school_id))
with check (app_private.can_manage_examinations(school_id));

create policy "examination_candidate_centre_assignment_manage [delete]"
on public.examination_candidate_centre_assignments
for delete to authenticated
using (app_private.can_manage_examinations(school_id));

drop policy if exists "school_examination_centre_assignment_manage" on public.school_examination_centre_assignments;

create policy "school_examination_centre_assignment_manage [insert]"
on public.school_examination_centre_assignments
for insert to authenticated
with check (app_private.can_manage_examinations(school_id));

create policy "school_examination_centre_assignment_manage [update]"
on public.school_examination_centre_assignments
for update to authenticated
using (app_private.can_manage_examinations(school_id))
with check (app_private.can_manage_examinations(school_id));

create policy "school_examination_centre_assignment_manage [delete]"
on public.school_examination_centre_assignments
for delete to authenticated
using (app_private.can_manage_examinations(school_id));

