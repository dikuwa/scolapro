create policy "linked guardians read published report cards" on public.report_card_snapshots
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.learner_guardians lg
    join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
    where lg.learner_id = report_card_snapshots.learner_id
      and lg.effective_from <= current_date
      and (lg.effective_to is null or lg.effective_to >= current_date)
      and gul.user_id = (select auth.uid())
  )
);

create or replace function public.publish_report_card_snapshot(p_snapshot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_recipient uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_snapshot
  from public.report_card_snapshots
  where id = p_snapshot_id
  for update;
  if not found then raise exception 'Report card snapshot not found'; end if;

  if not app_private.has_school_role(v_snapshot.school_id, array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_snapshot.status <> 'certified' then raise exception 'Only certified report-card snapshots can be published'; end if;

  update public.report_card_snapshots
  set status = 'published', published_at = now()
  where id = v_snapshot.id;

  for v_recipient in
    select distinct gul.user_id
    from public.learner_guardians lg
    join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
    where lg.learner_id = v_snapshot.learner_id
      and lg.effective_from <= current_date
      and (lg.effective_to is null or lg.effective_to >= current_date)
  loop
    insert into public.notifications (recipient_user_id, tenant_id, school_id, severity, title, body)
    values (
      v_recipient, v_snapshot.tenant_id, v_snapshot.school_id, 'success',
      'Report card available',
      'A certified term report has been published for your linked learner.'
    );
  end loop;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_snapshot.tenant_id, v_snapshot.school_id, auth.uid(),
    'report_card.snapshot.published', 'report_card_snapshot', v_snapshot.id,
    jsonb_build_object('learner_id', v_snapshot.learner_id, 'term_number', v_snapshot.term_number, 'snapshot_version', v_snapshot.snapshot_version)
  );

  return true;
end;
$$;

revoke all on function public.publish_report_card_snapshot(uuid) from public, anon;
grant execute on function public.publish_report_card_snapshot(uuid) to authenticated;

comment on function public.publish_report_card_snapshot(uuid) is 'Publishes a certified immutable report-card snapshot and notifies linked guardian accounts. Publication never recalculates report data.';
