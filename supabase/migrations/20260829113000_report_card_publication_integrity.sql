-- Certified/published report-card snapshots are historical documents. Their captured
-- learner/results/attendance payload must never be rewritten. A corrected report is a
-- new snapshot version; publication atomically supersedes the previously published one.

create or replace function app_private.guard_report_card_snapshot_immutability()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if tg_op='DELETE' then
    if old.status in ('certified','published','superseded') then
      raise exception 'Certified or published report-card snapshots cannot be deleted';
    end if;
    return old;
  end if;

  if old.status in ('certified','published','superseded') then
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.learner_id is distinct from old.learner_id
       or new.enrolment_id is distinct from old.enrolment_id
       or new.academic_year is distinct from old.academic_year
       or new.term_number is distinct from old.term_number
       or new.template_version is distinct from old.template_version
       or new.snapshot_version is distinct from old.snapshot_version
       or new.data_snapshot is distinct from old.data_snapshot
       or new.generated_by_user_id is distinct from old.generated_by_user_id
       or new.generated_at is distinct from old.generated_at
       or new.certified_by_user_id is distinct from old.certified_by_user_id
       or new.certified_at is distinct from old.certified_at
       or new.supersedes_snapshot_id is distinct from old.supersedes_snapshot_id then
      raise exception 'Certified report-card snapshot content is immutable';
    end if;
  end if;

  if old.status='superseded' and new.status<>old.status then
    raise exception 'Superseded report-card snapshots are immutable';
  end if;
  if old.status='published' and new.status not in ('published','superseded') then
    raise exception 'Published report-card snapshots may only be superseded';
  end if;
  if old.status='certified' and new.status not in ('certified','published','superseded') then
    raise exception 'Certified report-card snapshots cannot return to draft';
  end if;

  return new;
end;
$$;
revoke all on function app_private.guard_report_card_snapshot_immutability() from public,anon,authenticated;

drop trigger if exists report_card_snapshot_immutability_guard on public.report_card_snapshots;
create trigger report_card_snapshot_immutability_guard
before update or delete on public.report_card_snapshots
for each row execute function app_private.guard_report_card_snapshot_immutability();

create unique index if not exists report_card_one_published_per_enrolment_term_uidx
on public.report_card_snapshots(enrolment_id,term_number)
where status='published';

create or replace function public.publish_report_card_snapshot(p_snapshot_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_recipient uuid;
  v_superseded_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_snapshot
  from public.report_card_snapshots
  where id=p_snapshot_id
  for update;
  if not found then raise exception 'Report card snapshot not found'; end if;

  if not app_private.has_school_role(v_snapshot.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_snapshot.status<>'certified' then
    raise exception 'Only certified report-card snapshots can be published';
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_superseded_ids
  from public.report_card_snapshots
  where enrolment_id=v_snapshot.enrolment_id
    and term_number=v_snapshot.term_number
    and id<>v_snapshot.id
    and status='published';

  update public.report_card_snapshots
  set status='superseded'
  where enrolment_id=v_snapshot.enrolment_id
    and term_number=v_snapshot.term_number
    and id<>v_snapshot.id
    and status='published';

  update public.report_card_snapshots
  set status='published',published_at=now()
  where id=v_snapshot.id;

  for v_recipient in
    select distinct gul.user_id
    from public.learner_guardians lg
    join public.guardian_user_links gul on gul.guardian_id=lg.guardian_id
    where lg.learner_id=v_snapshot.learner_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
  loop
    insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title,body)
    values(
      v_recipient,v_snapshot.tenant_id,v_snapshot.school_id,'success',
      'Report card available',
      'A certified term report has been published for your linked learner.'
    );
  end loop;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),
    'report_card.snapshot.published','report_card_snapshot',v_snapshot.id,
    jsonb_build_object(
      'learner_id',v_snapshot.learner_id,
      'term_number',v_snapshot.term_number,
      'snapshot_version',v_snapshot.snapshot_version,
      'superseded_snapshot_ids',to_jsonb(v_superseded_ids)
    )
  );

  return true;
end;
$$;
revoke all on function public.publish_report_card_snapshot(uuid) from public,anon;
grant execute on function public.publish_report_card_snapshot(uuid) to authenticated;

comment on index public.report_card_one_published_per_enrolment_term_uidx is
'At most one report-card snapshot is currently published for an enrolment and term. Reissued reports supersede prior published snapshots atomically.';
comment on function app_private.guard_report_card_snapshot_immutability() is
'Prevents certified/published report-card payloads and provenance from being rewritten. Corrections require a new snapshot version.';