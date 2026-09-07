-- Control Room review hardening for N02/N03/N04.

-- External identifiers are canonical at rest so whitespace variants cannot evade
-- the effective-period collision constraints.
alter table public.school_external_identifiers
  add constraint school_external_identifiers_value_trimmed
  check (identifier_value = btrim(identifier_value));

-- Revalidate the denormalized school placement after hierarchy-history changes.
-- AFTER triggers see the proposed post-mutation state; raising rolls the mutation
-- back, preserving both historical reproducibility and network access correctness.
create or replace function app_private.validate_school_network_assignments_after_hierarchy_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invalid_school_id uuid;
begin
  select a.school_id
    into v_invalid_school_id
  from public.school_network_assignments a
  where not exists (
      select 1
      from public.education_region_authority_history h
      where h.region_id = a.region_id
        and h.authority_id = a.authority_id
        and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]')
            @> daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
    )
    or not exists (
      select 1
      from public.education_circuit_region_history h
      where h.circuit_id = a.circuit_id
        and h.region_id = a.region_id
        and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]')
            @> daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
    )
    or (
      a.cluster_id is not null
      and not exists (
        select 1
        from public.education_cluster_circuit_history h
        where h.cluster_id = a.cluster_id
          and h.circuit_id = a.circuit_id
          and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]')
              @> daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
      )
    )
  limit 1;

  if v_invalid_school_id is not null then
    raise exception 'Hierarchy history mutation would invalidate school network assignment for school %', v_invalid_school_id;
  end if;

  return null;
end;
$$;

revoke all on function app_private.validate_school_network_assignments_after_hierarchy_change()
from public, anon, authenticated;

create trigger education_region_authority_history_reverse_integrity_trg
after insert or update or delete on public.education_region_authority_history
for each statement execute function app_private.validate_school_network_assignments_after_hierarchy_change();

create trigger education_circuit_region_history_reverse_integrity_trg
after insert or update or delete on public.education_circuit_region_history
for each statement execute function app_private.validate_school_network_assignments_after_hierarchy_change();

create trigger education_cluster_circuit_history_reverse_integrity_trg
after insert or update or delete on public.education_cluster_circuit_history
for each statement execute function app_private.validate_school_network_assignments_after_hierarchy_change();

-- Global education-network audit rows deliberately have no school_id/tenant_id.
-- Only platform administrators may read those rows; school-scoped audit policies
-- remain unchanged and continue governing school-level events.
create policy education_network_global_audit_platform_admin_read
on public.audit_events
for select
to authenticated
using (
  school_id is null
  and tenant_id is null
  and event_type like 'education_network.%'
  and app_private.has_platform_role(array['platform_admin'])
);
