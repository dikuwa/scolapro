create or replace function public.complete_detention_session(
  p_session_id uuid,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_unrecorded integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id=p_session_id
  for update;

  if not found then raise exception 'Detention session not found'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
    or app_private.can_supervise_detention_session(v_session.id)
  ) then raise exception 'Permission denied'; end if;

  if v_session.status='completed' then
    raise exception 'Detention session is already completed';
  end if;
  if v_session.status='cancelled' then
    raise exception 'Cancelled detention sessions cannot be completed';
  end if;
  if v_session.status not in ('planned','open') then
    raise exception 'Detention session cannot be completed in its current state';
  end if;

  select count(*) into v_unrecorded
  from public.detention_session_items
  where detention_session_id=p_session_id
    and attendance_status='scheduled';

  if v_unrecorded>0 then
    raise exception 'All scheduled learners must have a detention attendance outcome';
  end if;

  update public.detention_sessions
  set status='completed',
      completed_by_user_id=auth.uid(),
      completed_at=now(),
      notes=coalesce(nullif(btrim(p_notes),''),notes),
      updated_at=now()
  where id=p_session_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_session.tenant_id,
    v_session.school_id,
    auth.uid(),
    'detention.session.completed',
    'detention_session',
    v_session.id,
    jsonb_build_object(
      'session_date',v_session.session_date,
      'previous_status',v_session.status
    )
  );

  return true;
end;
$$;

revoke all on function public.complete_detention_session(uuid,text) from public,anon;
grant execute on function public.complete_detention_session(uuid,text) to authenticated;

comment on function public.complete_detention_session(uuid,text) is
'Completes a planned/open detention session exactly once after all scheduled learner outcomes are recorded. Completed and cancelled sessions are final and cannot be re-completed.';
