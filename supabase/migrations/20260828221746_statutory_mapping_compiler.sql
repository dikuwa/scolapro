-- Generic statutory form mapping compiler.
-- This deliberately does not encode Ministry/AEC field names. A published form
-- version supplies declarative source_path/target_path mappings after authoritative
-- form definitions are loaded and reviewed.

create table public.statutory_mapping_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  reporting_cycle_id uuid not null references public.statutory_reporting_cycles(id) on delete cascade,
  snapshot_id uuid not null references public.statutory_snapshots(id) on delete cascade,
  form_version_id uuid not null references public.statutory_form_versions(id) on delete restrict,
  mapping_schema_snapshot jsonb not null,
  mapped_values jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  blocking_issue_count integer not null default 0 check (blocking_issue_count >= 0),
  status text not null default 'compiled' check (status in ('compiled','blocked','superseded')),
  compiled_by_user_id uuid not null references auth.users(id) on delete restrict,
  compiled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(mapping_schema_snapshot)='object'),
  check (jsonb_typeof(mapped_values)='object'),
  check (jsonb_typeof(issues)='array')
);
create index statutory_mapping_runs_snapshot_idx
  on public.statutory_mapping_runs(snapshot_id,compiled_at desc);
create index statutory_mapping_runs_cycle_idx
  on public.statutory_mapping_runs(reporting_cycle_id,status,compiled_at desc);

alter table public.statutory_mapping_runs enable row level security;
create policy "statutory staff read mapping runs"
on public.statutory_mapping_runs for select to authenticated
using (app_private.can_manage_statutory(school_id));
revoke all on public.statutory_mapping_runs from anon,authenticated;
grant select on public.statutory_mapping_runs to authenticated;
grant select,insert,update,delete on public.statutory_mapping_runs to service_role;

create or replace function public.validate_statutory_mapping_schema(p_mapping_schema jsonb)
returns jsonb
language plpgsql
immutable
set search_path=public
as $$
declare
  v_fields jsonb;
  v_field jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_expected text;
begin
  if p_mapping_schema is null or jsonb_typeof(p_mapping_schema)<>'object' then
    return jsonb_build_object('valid',false,'errors',jsonb_build_array('mapping_schema must be a JSON object'));
  end if;
  v_fields:=coalesce(p_mapping_schema->'fields','[]'::jsonb);
  if jsonb_typeof(v_fields)<>'array' then
    return jsonb_build_object('valid',false,'errors',jsonb_build_array('mapping_schema.fields must be an array'));
  end if;

  for v_field in select value from jsonb_array_elements(v_fields)
  loop
    v_index:=v_index+1;
    if jsonb_typeof(v_field)<>'object' then
      v_errors:=v_errors||jsonb_build_array(format('field %s must be an object',v_index));
      continue;
    end if;
    if jsonb_typeof(v_field->'source_path')<>'array' or jsonb_array_length(v_field->'source_path')=0 then
      v_errors:=v_errors||jsonb_build_array(format('field %s source_path must be a non-empty array',v_index));
    end if;
    if jsonb_typeof(v_field->'target_path')<>'array' or jsonb_array_length(v_field->'target_path')=0 then
      v_errors:=v_errors||jsonb_build_array(format('field %s target_path must be a non-empty array',v_index));
    end if;
    v_expected:=nullif(v_field->>'expected_type','');
    if v_expected is not null and v_expected not in ('string','number','boolean','object','array','null') then
      v_errors:=v_errors||jsonb_build_array(format('field %s expected_type is unsupported',v_index));
    end if;
  end loop;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors,'field_count',jsonb_array_length(v_fields));
end;
$$;

create or replace function public.compile_statutory_mapping(p_snapshot_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.statutory_snapshots%rowtype;
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_version public.statutory_form_versions%rowtype;
  v_schema_check jsonb;
  v_field jsonb;
  v_source_path text[];
  v_target_path text[];
  v_value jsonb;
  v_required boolean;
  v_expected text;
  v_mapped jsonb := '{}'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_blocking integer := 0;
  v_run_id uuid;
  v_issue jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_snapshot from public.statutory_snapshots where id=p_snapshot_id;
  if not found then raise exception 'Statutory snapshot not found'; end if;
  select * into v_cycle from public.statutory_reporting_cycles where id=v_snapshot.reporting_cycle_id;
  if not found then raise exception 'Reporting cycle not found'; end if;
  select * into v_version from public.statutory_form_versions where id=v_cycle.form_version_id;
  if not found then raise exception 'Statutory form version not found'; end if;
  if not app_private.can_manage_statutory(v_snapshot.school_id) then raise exception 'Permission denied'; end if;
  if v_version.status not in ('approved','published','superseded') then
    raise exception 'Statutory mapping may only compile against an approved/published form version';
  end if;

  v_schema_check:=public.validate_statutory_mapping_schema(v_version.mapping_schema);
  if not coalesce((v_schema_check->>'valid')::boolean,false) then
    raise exception 'Invalid statutory mapping schema: %',v_schema_check->'errors';
  end if;

  for v_field in select value from jsonb_array_elements(coalesce(v_version.mapping_schema->'fields','[]'::jsonb))
  loop
    select array_agg(value order by ord) into v_source_path
      from jsonb_array_elements_text(v_field->'source_path') with ordinality x(value,ord);
    select array_agg(value order by ord) into v_target_path
      from jsonb_array_elements_text(v_field->'target_path') with ordinality x(value,ord);
    v_required:=coalesce((v_field->>'required')::boolean,false);
    v_expected:=nullif(v_field->>'expected_type','');
    v_value:=v_snapshot.values #> v_source_path;

    if v_value is null or v_value='null'::jsonb then
      if v_required then
        v_blocking:=v_blocking+1;
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
          'severity','blocking','code','required_value_missing',
          'source_path',v_field->'source_path','target_path',v_field->'target_path',
          'message',coalesce(v_field->>'label','Required statutory value is missing')
        ));
      end if;
      continue;
    end if;

    if v_expected is not null and jsonb_typeof(v_value)<>v_expected then
      v_blocking:=v_blocking+1;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
        'severity','blocking','code','value_type_mismatch',
        'source_path',v_field->'source_path','target_path',v_field->'target_path',
        'expected_type',v_expected,'actual_type',jsonb_typeof(v_value),
        'message',coalesce(v_field->>'label','Statutory value has an unexpected type')
      ));
      continue;
    end if;

    v_mapped:=jsonb_set(v_mapped,v_target_path,v_value,true);
  end loop;

  update public.statutory_mapping_runs
  set status='superseded'
  where snapshot_id=v_snapshot.id and status in ('compiled','blocked');

  insert into public.statutory_mapping_runs(
    tenant_id,school_id,reporting_cycle_id,snapshot_id,form_version_id,
    mapping_schema_snapshot,mapped_values,issues,blocking_issue_count,status,compiled_by_user_id
  ) values(
    v_snapshot.tenant_id,v_snapshot.school_id,v_cycle.id,v_snapshot.id,v_version.id,
    v_version.mapping_schema,v_mapped,v_issues,v_blocking,case when v_blocking>0 then 'blocked' else 'compiled' end,auth.uid()
  ) returning id into v_run_id;

  -- Replace only compiler-owned unresolved issues for this exact snapshot.
  delete from public.statutory_readiness_issues
  where reporting_cycle_id=v_cycle.id
    and domain_type='statutory_snapshot'
    and domain_id=v_snapshot.id
    and issue_code like 'FORM_MAPPING_%'
    and resolved=false;

  for v_issue in select value from jsonb_array_elements(v_issues)
  loop
    insert into public.statutory_readiness_issues(
      tenant_id,school_id,reporting_cycle_id,issue_code,domain_type,domain_id,severity,message
    ) values(
      v_snapshot.tenant_id,v_snapshot.school_id,v_cycle.id,
      'FORM_MAPPING_'||upper(v_issue->>'code'),'statutory_snapshot',v_snapshot.id,
      coalesce(v_issue->>'severity','blocking'),coalesce(v_issue->>'message','Statutory form mapping issue')
    );
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),'statutory.mapping.compiled','statutory_mapping_run',v_run_id,
    jsonb_build_object('snapshot_id',v_snapshot.id,'form_version_id',v_version.id,'blocking_issue_count',v_blocking));

  return v_run_id;
end;
$$;

revoke all on function public.validate_statutory_mapping_schema(jsonb) from public,anon;
grant execute on function public.validate_statutory_mapping_schema(jsonb) to authenticated;
revoke all on function public.compile_statutory_mapping(uuid) from public,anon;
grant execute on function public.compile_statutory_mapping(uuid) to authenticated;

comment on function public.validate_statutory_mapping_schema(jsonb) is 'Validates the generic declarative form mapping shape only; it does not invent or certify Ministry field definitions.';
comment on function public.compile_statutory_mapping(uuid) is 'Maps an immutable operational statutory snapshot into an authoritative form-version schema and emits readiness exceptions for missing/type-invalid source values.';
