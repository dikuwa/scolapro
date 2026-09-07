-- N05: regional/circuit reviewers may inspect statutory lifecycle state for
-- schools in their effective network scope. This is deliberately read-only:
-- network membership does not grant compile, readiness mutation, certification,
-- or access to underlying learner/staff facts.

create policy "network reviewers can read statutory reporting cycles"
on public.statutory_reporting_cycles for select to authenticated
using (app_private.can_view_school_via_network(school_id, current_date));

create policy "network reviewers can read statutory snapshots"
on public.statutory_snapshots for select to authenticated
using (app_private.can_view_school_via_network(school_id, current_date));

create policy "network reviewers can read statutory readiness issues"
on public.statutory_readiness_issues for select to authenticated
using (app_private.can_view_school_via_network(school_id, current_date));

create policy "network reviewers can read statutory certifications"
on public.statutory_certifications for select to authenticated
using (app_private.can_view_school_via_network(school_id, current_date));

create policy "network reviewers can read statutory mapping runs"
on public.statutory_mapping_runs for select to authenticated
using (app_private.can_view_school_via_network(school_id, current_date));

comment on policy "network reviewers can read statutory reporting cycles" on public.statutory_reporting_cycles
is 'N05 read-only circuit/regional statutory lifecycle review; does not imply access to source learner/staff facts.';