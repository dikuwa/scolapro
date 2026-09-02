create or replace function public.reassign_late_detention_supervisor(
  p_obligation_id uuid,
  p_staff_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_supervisor_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_item
  from public.late_detention_obligations
  where id=p_obligation_id
  for update;

  if not found then raise exception 'Detention obligation not found'; end if;
  if not app_private.has_school_role(v_item.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if v_item.status not in ('pending','carried_forward') then
    raise exception 'Only pending detention obligations can be reassigned';
  end if;
  if not app_private.staff_member_has_school_assignment(p_staff_member_id,v_item.school_id,v_item.due_on) then
    raise exception 'Supervisor is not assigned to this school on the detention due date';
  end if;

  if p_staff_member_id is not distinct from v_item.assigned_staff_member_id then
    return true;
  end if;

  update public.late_detention_obligations
  set assigned_staff_member_id=p_staff_member_id,updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_item.tenant_id,v_item.school_id,auth.uid(),
    'late_detention.supervisor_reassigned','late_detention_obligation',v_item.id,
    jsonb_build_object(
      'reason','manual_reassignment',
      'previous_staff_member_id',v_item.assigned_staff_member_id,
      'staff_member_id',p_staff_member_id,
      'due_on',v_item.due_on
    )
  );

  select sm.user_id into v_supervisor_user_id
  from public.staff_members sm
  where sm.id=p_staff_member_id;

  if v_supervisor_user_id is not null then
    insert into public.notifications(
      recipient_user_id,tenant_id,school_id,severity,title,body,href
    ) values (
      v_supervisor_user_id,v_item.tenant_id,v_item.school_id,'info',
      'Detention supervision assigned',
      'A learner detention obligation has been assigned to you for ' || to_char(v_item.due_on,'DD Mon YYYY') || '.',
      '/late-arrivals'
    );
  end if;

  return true;
end;
$$;

revoke all on function public.reassign_late_detention_supervisor(uuid,uuid) from public,anon;
grant execute on function public.reassign_late_detention_supervisor(uuid,uuid) to authenticated;

comment on function public.reassign_late_detention_supervisor(uuid,uuid) is
'Reassigns a pending late-detention obligation only to active staff placed at the school on the due date, records semantic audit provenance, notifies a newly assigned account, and treats same-supervisor retries idempotently.';
