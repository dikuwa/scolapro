-- Corrections are intentionally limited to the learner's latest late-arrival event.
-- This preserves historical threshold chronology while allowing an accidental newest
-- entry to be reversed safely. Completed/session-backed detention history is immutable.

create or replace function public.undo_latest_school_late_arrival(
  p_enrolment_id uuid,
  p_reason text default 'Incorrect late-arrival entry'
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrol public.enrolments%rowtype;
  v_event public.school_late_arrival_events%rowtype;
  v_obligation public.late_detention_obligations%rowtype;
  v_has_session boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_enrol
  from public.enrolments
  where id=p_enrolment_id;
  if not found then raise exception 'Learner enrolment not found'; end if;

  if not app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Only school leadership can undo a late-arrival entry';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_enrol.school_id::text || ':' || v_enrol.learner_id::text,0));

  select e.* into v_event
  from public.school_late_arrival_events e
  join public.enrolments en on en.id=e.enrolment_id
  where e.school_id=v_enrol.school_id
    and e.learner_id=v_enrol.learner_id
    and en.academic_year=v_enrol.academic_year
  order by e.arrival_date desc,e.recorded_at desc,e.id desc
  limit 1
  for update of e;

  if not found then raise exception 'No late-arrival entry exists for this learner'; end if;

  select * into v_obligation
  from public.late_detention_obligations
  where trigger_event_id=v_event.id
  limit 1
  for update;

  if found then
    select exists(
      select 1 from public.detention_session_items item
      where item.obligation_id=v_obligation.id
    ) into v_has_session;

    if v_obligation.status not in ('pending','carried_forward') or v_has_session then
      raise exception 'This late arrival cannot be undone because its detention history is already finalized';
    end if;

    delete from public.late_detention_obligations where id=v_obligation.id;
  end if;

  delete from public.school_late_arrival_events where id=v_event.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'school_late_arrival.corrected','learner',v_enrol.learner_id,
    jsonb_build_object(
      'removed_event_id',v_event.id,
      'arrival_date',v_event.arrival_date,
      'removed_detention_obligation_id',case when v_obligation.id is null then null else to_jsonb(v_obligation.id) end,
      'reason',nullif(btrim(coalesce(p_reason,'')),'')
    )
  );

  return true;
end;
$$;

revoke all on function public.undo_latest_school_late_arrival(uuid,text) from public,anon;
grant execute on function public.undo_latest_school_late_arrival(uuid,text) to authenticated;

comment on function public.undo_latest_school_late_arrival(uuid,text) is
'Leadership-only correction for the latest learner late-arrival event. Removes an unresolved trigger obligation when necessary, but refuses to rewrite completed or session-backed detention history.';
