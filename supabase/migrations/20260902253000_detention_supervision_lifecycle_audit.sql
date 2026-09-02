create or replace function app_private.audit_detention_supervision_preference_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='UPDATE' and new.eligible is not distinct from old.eligible then
    return new;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    new.tenant_id,
    new.school_id,
    auth.uid(),
    case when new.eligible then 'detention_supervision.preference_enabled'
         else 'detention_supervision.preference_disabled' end,
    'detention_supervision_preference',
    new.id,
    jsonb_build_object(
      'staff_member_id',new.staff_member_id,
      'eligible',new.eligible,
      'previous_eligible',case when tg_op='UPDATE' then old.eligible else null end,
      'operation',lower(tg_op)
    )
  );

  return new;
end;
$$;

revoke all on function app_private.audit_detention_supervision_preference_change()
from public,anon,authenticated;

drop trigger if exists detention_supervision_preference_audit_trg
on public.detention_supervision_preferences;

create trigger detention_supervision_preference_audit_trg
after insert or update
on public.detention_supervision_preferences
for each row execute function app_private.audit_detention_supervision_preference_change();

create or replace function public.roll_forward_late_detentions(
  p_school_id uuid,
  p_reference_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_count integer := 0;
  v_next_due date;
  v_detention_weekday smallint;
  v_carry_forward boolean;
  v_item record;
  v_supervisor_id uuid;
  v_supervisor_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_reference_date)
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  select detention_weekday,carry_forward into v_detention_weekday,v_carry_forward
  from public.school_late_arrival_policies
  where school_id=p_school_id and active=true;

  if v_detention_weekday is null then raise exception 'Late arrival policy is not active'; end if;
  if not v_carry_forward then return 0; end if;

  v_next_due := app_private.next_policy_weekday_after(p_reference_date,v_detention_weekday);

  for v_item in
    select id,tenant_id,school_id,assigned_staff_member_id,due_on
    from public.late_detention_obligations
    where school_id=p_school_id
      and status in ('pending','carried_forward')
      and due_on<p_reference_date
    order by due_on,id
    for update
  loop
    v_supervisor_id := v_item.assigned_staff_member_id;

    if v_supervisor_id is null
      or not app_private.staff_member_has_school_assignment(v_supervisor_id,p_school_id,v_next_due) then
      v_supervisor_id := app_private.pick_detention_supervisor(p_school_id,v_next_due);
    end if;

    update public.late_detention_obligations
    set status='carried_forward',
        due_on=v_next_due,
        rollover_count=rollover_count+1,
        assigned_staff_member_id=v_supervisor_id,
        updated_at=now()
    where id=v_item.id;

    if v_supervisor_id is distinct from v_item.assigned_staff_member_id then
      insert into public.audit_events(
        tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
      ) values (
        v_item.tenant_id,v_item.school_id,auth.uid(),
        'late_detention.supervisor_reassigned','late_detention_obligation',v_item.id,
        jsonb_build_object(
          'reason','roll_forward',
          'previous_staff_member_id',v_item.assigned_staff_member_id,
          'staff_member_id',v_supervisor_id,
          'previous_due_on',v_item.due_on,
          'due_on',v_next_due
        )
      );

      if v_supervisor_id is not null then
        select sm.user_id into v_supervisor_user_id
        from public.staff_members sm
        where sm.id=v_supervisor_id;

        if v_supervisor_user_id is not null then
          insert into public.notifications(
            recipient_user_id,tenant_id,school_id,severity,title,body,href
          ) values (
            v_supervisor_user_id,v_item.tenant_id,v_item.school_id,'info',
            'Detention supervision assigned',
            'A carried-forward learner detention has been assigned to you for ' || to_char(v_next_due,'DD Mon YYYY') || '.',
            '/late-arrivals'
          );
        end if;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon;
grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;

comment on function app_private.audit_detention_supervision_preference_change() is
'Audits semantic detention-supervision eligibility changes, including direct RLS-authorized writes, using the authenticated actor stamped by the integrity boundary.';
comment on function public.roll_forward_late_detentions(uuid,date) is
'Carries overdue detention obligations forward, assigns or repairs due-date-valid supervisors, and audits/notifies supervisor changes.';