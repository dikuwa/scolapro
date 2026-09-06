-- Govern learner-specific manual remarks as part of the mutable draft snapshot.
-- Once a report-card snapshot leaves draft, its frozen academic/document payload
-- must not be rewritten. The remark body is deliberately omitted from audit metadata.

create or replace function public.save_report_card_snapshot_remark(
  p_snapshot_id uuid,
  p_remark text
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_remark text := btrim(coalesce(p_remark, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_snapshot
  from public.report_card_snapshots
  where id=p_snapshot_id
  for update;

  if not found then
    raise exception 'Report-card snapshot not found';
  end if;

  if not app_private.has_school_role(
    v_snapshot.school_id,
    array['school_admin','principal','deputy_principal']
  ) then
    raise exception 'Permission denied';
  end if;

  if v_snapshot.status <> 'draft' then
    raise exception 'Only draft report-card remarks can be changed';
  end if;

  if char_length(v_remark) > 1200 then
    raise exception 'Report-card remark is too long';
  end if;

  update public.report_card_snapshots
  set data_snapshot=jsonb_set(
    coalesce(data_snapshot, '{}'::jsonb),
    '{remarks}',
    to_jsonb(v_remark),
    true
  )
  where id=v_snapshot.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_snapshot.tenant_id,
    v_snapshot.school_id,
    auth.uid(),
    'report_card.remark.saved',
    'report_card_snapshot',
    v_snapshot.id,
    jsonb_build_object(
      'enrolment_id',v_snapshot.enrolment_id,
      'academic_year',v_snapshot.academic_year,
      'term_number',v_snapshot.term_number,
      'remark_present',v_remark <> '',
      'remark_length',char_length(v_remark)
    )
  );
end;
$$;

revoke all on function public.save_report_card_snapshot_remark(uuid,text)
from public,anon,authenticated;
grant execute on function public.save_report_card_snapshot_remark(uuid,text)
to authenticated;

comment on function public.save_report_card_snapshot_remark(uuid,text) is
  'Lets owning school report managers save a reviewed learner-specific remark only while the report-card snapshot is still draft; certification makes the frozen payload immutable.';
