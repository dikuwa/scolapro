-- Reuse ScolaPro's canonical audit_events store for education-network governance.
-- The foundation migration initially creates a local append-only audit table so
-- every mutation is covered even in isolation; this follow-up removes that
-- transitional store and routes the same governed mutations into audit_events.

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'education_authorities',
    'education_regions',
    'education_circuits',
    'education_clusters',
    'education_region_authority_history',
    'education_circuit_region_history',
    'education_cluster_circuit_history',
    'school_network_assignments',
    'school_external_identifiers',
    'education_network_memberships'
  ] LOOP
    EXECUTE format('drop trigger if exists %I on public.%I', v_table || '_audit_trg', v_table);
  END LOOP;
END;
$$;

drop table if exists public.education_network_audit_events;
drop function if exists app_private.enforce_education_network_audit_immutability();
drop function if exists app_private.audit_education_network_mutation();

create or replace function app_private.audit_education_network_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
  v_school_id uuid;
  v_tenant_id uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  v_school_id := coalesce((v_new ->> 'school_id')::uuid, (v_old ->> 'school_id')::uuid);

  if v_school_id is not null then
    select s.tenant_id into v_tenant_id
    from public.schools s
    where s.id = v_school_id;
  end if;

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_tenant_id,
    v_school_id,
    auth.uid(),
    'education_network.' || lower(tg_op),
    tg_table_name,
    v_row_id,
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.audit_education_network_mutation() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'education_authorities',
    'education_regions',
    'education_circuits',
    'education_clusters',
    'education_region_authority_history',
    'education_circuit_region_history',
    'education_cluster_circuit_history',
    'school_network_assignments',
    'school_external_identifiers',
    'education_network_memberships'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_education_network_mutation()',
      v_table || '_audit_trg', v_table
    );
  end loop;
end;
$$;

comment on function app_private.audit_education_network_mutation() is
'Writes governed education-network reference, hierarchy, school-placement, external-identifier and membership mutations to the canonical public.audit_events ledger.';
