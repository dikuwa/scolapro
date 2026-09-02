create or replace function app_private.is_assigned_late_detention_supervisor(
  p_obligation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists (
    select 1
    from public.late_detention_obligations o
    join public.staff_members sm
      on sm.id=o.assigned_staff_member_id
     and sm.user_id=auth.uid()
     and sm.status='active'
    where o.id=p_obligation_id
      and o.status in ('pending','carried_forward')
      and app_private.staff_member_has_school_assignment(sm.id,o.school_id,o.due_on)
  );
$$;

revoke all on function app_private.is_assigned_late_detention_supervisor(uuid)
from public,anon,authenticated;

create or replace function public.resolve_late_detention(
  p_obligation_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_is_leadership boolean;
  v_has_late_duty boolean;
  v_is_assigned_supervisor boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('completed','waived') then raise exception 'Resolution must be completed or waived'; end if;

  select * into v_item
  from public.late_detention_obligations
  where id=p_obligation_id
  for update;

  if not found then raise exception 'Detention obligation not found'; end if;
  if v_item.status in ('completed','waived') then raise exception 'Detention obligation is already resolved'; end if;

  v_is_leadership := app_private.has_school_role(
    v_item.school_id,
    array['school_admin','principal','deputy_principal']
  );
  v_has_late_duty := app_private.has_school_duty(
    v_item.school_id,
    'late_arrival_recorder'
  );
  v_is_assigned_supervisor := app_private.is_assigned_late_detention_supervisor(v_item.id);

  if not (
    v_is_leadership
    or v_has_late_duty
    or (p_status='completed' and v_is_assigned_supervisor)
  ) then
    raise exception 'Permission denied';
  end if;

  update public.late_detention_obligations
  set status=p_status,
      completed_at=case when p_status='completed' then now() else null end,
      completed_by_user_id=auth.uid(),
      resolution_note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_item.tenant_id,
    v_item.school_id,
    auth.uid(),
    'late_detention.resolved',
    'learner',
    v_item.learner_id,
    jsonb_build_object(
      'obligation_id',p_obligation_id,
      'status',p_status,
      'previous_status',v_item.status,
      'assigned_supervisor_completion',
        (p_status='completed' and v_is_assigned_supervisor and not v_is_leadership and not v_has_late_duty)
    )
  );

  return true;
end;
$$;

revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon;
grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;

comment on function app_private.is_assigned_late_detention_supervisor(uuid) is
'Private authorization predicate proving that the signed-in active staff account is the due-date-valid assigned supervisor for an unresolved detention obligation.';

comment on function public.resolve_late_detention(uuid,text,text) is
'Completes or waives an unresolved late-detention obligation. Leadership and delegated late-arrival duty retain the existing resolution boundary; an assigned due-date-valid supervisor may complete, but not waive, their own obligation.';
