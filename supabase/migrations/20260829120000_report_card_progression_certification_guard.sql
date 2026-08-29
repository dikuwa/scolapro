-- A report-card snapshot may be drafted while year-end progression is still under
-- review, but it must not be certified as an official document with a draft/reviewed
-- promotion outcome embedded in its immutable payload. Rebuild after progression approval.

create or replace function public.certify_report_card_snapshot(p_snapshot_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_progression_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_snapshot
  from public.report_card_snapshots
  where id=p_snapshot_id
  for update;
  if not found then raise exception 'Report card snapshot not found'; end if;

  if not app_private.has_school_role(v_snapshot.school_id,array['principal','deputy_principal','school_admin'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_snapshot.status<>'draft' then
    raise exception 'Only draft report-card snapshots can be certified';
  end if;

  v_progression_status:=nullif(v_snapshot.data_snapshot #>> '{year_end_progression,status}','');
  if v_progression_status is not null
     and v_progression_status not in ('approved','locked') then
    raise exception 'Report card contains a progression decision that is not approved';
  end if;

  update public.report_card_snapshots
  set status='certified',
      certified_by_user_id=auth.uid(),
      certified_at=now()
  where id=v_snapshot.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),
    'report_card.snapshot.certified','report_card_snapshot',v_snapshot.id,
    jsonb_build_object(
      'term_number',v_snapshot.term_number,
      'snapshot_version',v_snapshot.snapshot_version,
      'year_end_progression_status',v_progression_status
    )
  );

  return true;
end;
$$;
revoke all on function public.certify_report_card_snapshot(uuid) from public,anon;
grant execute on function public.certify_report_card_snapshot(uuid) to authenticated;

comment on function public.certify_report_card_snapshot(uuid) is
'Certifies an immutable report-card snapshot only when any embedded year-end progression decision is already approved or locked.';