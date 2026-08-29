-- Teachers and HODs may need scoped academic visibility, but official report generation,
-- replacement, certification, publication and rendering are management operations.
-- Preserve the mature snapshot builder behind a non-client internal function and expose a
-- management-gated wrapper under the existing RPC contract.

alter function public.build_report_card_snapshot(uuid,smallint,text)
  rename to build_report_card_snapshot_management_internal;

revoke all on function public.build_report_card_snapshot_management_internal(uuid,smallint,text)
  from public,anon,authenticated;

create or replace function public.build_report_card_snapshot(
  p_enrolment_id uuid,
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select school_id into v_school_id from public.enrolments where id=p_enrolment_id;
  if v_school_id is null then raise exception 'Enrolment not found'; end if;
  if not (
    app_private.has_school_role(v_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then
    raise exception 'Report-card generation is restricted to school administration and management';
  end if;
  return public.build_report_card_snapshot_management_internal(p_enrolment_id,p_term_number,p_template_version);
end;
$$;

revoke all on function public.build_report_card_snapshot(uuid,smallint,text) from public,anon;
grant execute on function public.build_report_card_snapshot(uuid,smallint,text) to authenticated;

alter function public.build_report_card_snapshots_bulk(uuid[],smallint,text)
  rename to build_report_card_snapshots_bulk_management_internal;

revoke all on function public.build_report_card_snapshots_bulk_management_internal(uuid[],smallint,text)
  from public,anon,authenticated;

create or replace function public.build_report_card_snapshots_bulk(
  p_enrolment_ids uuid[],
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_enrolment_ids,1),0)=0 then raise exception 'Choose at least one learner'; end if;
  if exists(
    select 1
    from public.enrolments e
    where e.id=any(p_enrolment_ids)
      and not (
        app_private.has_school_role(e.school_id,array['school_admin','principal','deputy_principal'])
        or app_private.has_platform_role(array['platform_admin'])
      )
  ) then
    raise exception 'Bulk report-card generation is restricted to school administration and management';
  end if;
  if (select count(*) from public.enrolments e where e.id=any(p_enrolment_ids))<>cardinality(p_enrolment_ids) then
    raise exception 'One or more enrolments could not be resolved';
  end if;
  return public.build_report_card_snapshots_bulk_management_internal(p_enrolment_ids,p_term_number,p_template_version);
end;
$$;

revoke all on function public.build_report_card_snapshots_bulk(uuid[],smallint,text) from public,anon;
grant execute on function public.build_report_card_snapshots_bulk(uuid[],smallint,text) to authenticated;

comment on function public.build_report_card_snapshot(uuid,smallint,text) is
'Official report-card generation boundary. Teachers and HODs remain read-only; generation is restricted to School Admin, Principal, Deputy Principal and Platform Admin.';
