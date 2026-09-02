create or replace function app_private.staff_member_has_school_assignment(
  p_staff_member_id uuid,
  p_school_id uuid,
  p_on_date date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select p_staff_member_id is not null
    and p_school_id is not null
    and p_on_date is not null
    and exists (
      select 1
      from public.staff_members sm
      join public.schools s on s.id=p_school_id and s.tenant_id=sm.tenant_id
      where sm.id=p_staff_member_id
        and sm.status='active'
        and (
          exists (
            select 1
            from public.staff_school_assignments ssa
            where ssa.staff_member_id=sm.id
              and ssa.tenant_id=sm.tenant_id
              and ssa.school_id=s.id
              and ssa.effective_from<=p_on_date
              and (ssa.effective_to is null or ssa.effective_to>=p_on_date)
          )
          or exists (
            select 1
            from public.school_memberships m
            where m.staff_member_id=sm.id
              and m.tenant_id=sm.tenant_id
              and m.school_id=s.id
              and m.active_from<=p_on_date
              and (m.active_to is null or m.active_to>=p_on_date)
          )
        )
    );
$$;

revoke all on function app_private.staff_member_has_school_assignment(uuid,uuid,date)
from public,anon,authenticated;

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

  update public.late_detention_obligations
  set assigned_staff_member_id=p_staff_member_id,updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_item.tenant_id,v_item.school_id,auth.uid(),
    'late_detention.supervisor_reassigned','late_detention_obligation',v_item.id,
    jsonb_build_object('staff_member_id',p_staff_member_id,'due_on',v_item.due_on)
  );
  return true;
end;
$$;

revoke all on function public.reassign_late_detention_supervisor(uuid,uuid) from public,anon;
grant execute on function public.reassign_late_detention_supervisor(uuid,uuid) to authenticated;

create or replace function public.record_school_late_arrival(
  p_enrolment_id uuid,
  p_arrival_date date default current_date,
  p_arrived_at time default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrol public.enrolments%rowtype;
  v_event_id uuid;
  v_existing_event_id uuid;
  v_threshold smallint;
  v_detention_weekday smallint;
  v_total_count integer;
  v_obligation_count integer;
  v_progress integer;
  v_due_on date;
  v_supervisor_id uuid;
  v_supervisor_user_id uuid;
  v_obligation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_arrival_date>current_date then raise exception 'Future late-arrival dates are not allowed'; end if;

  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found or v_enrol.status<>'current' then raise exception 'Active learner enrolment not found'; end if;
  if not (
    app_private.has_school_duty(v_enrol.school_id,'late_arrival_recorder',p_arrival_date)
    or app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_enrol.school_id::text || ':' || v_enrol.learner_id::text,0));

  insert into public.school_late_arrival_policies(school_id,tenant_id)
  values(v_enrol.school_id,v_enrol.tenant_id)
  on conflict(school_id) do nothing;

  select cumulative_threshold,detention_weekday
  into v_threshold,v_detention_weekday
  from public.school_late_arrival_policies
  where school_id=v_enrol.school_id and active=true;
  if v_threshold is null or v_detention_weekday is null then raise exception 'Late arrival policy is not active'; end if;

  select id into v_existing_event_id
  from public.school_late_arrival_events
  where school_id=v_enrol.school_id and enrolment_id=v_enrol.id and arrival_date=p_arrival_date;

  insert into public.school_late_arrival_events(
    tenant_id,school_id,learner_id,enrolment_id,arrival_date,arrived_at,note,recorded_by_user_id
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,p_arrival_date,
    p_arrived_at,nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  )
  on conflict(school_id,enrolment_id,arrival_date) do update
  set arrived_at=excluded.arrived_at,note=excluded.note,recorded_by_user_id=auth.uid(),recorded_at=now()
  returning id into v_event_id;

  select count(*) into v_total_count
  from public.school_late_arrival_events e
  join public.enrolments en on en.id=e.enrolment_id
  where e.school_id=v_enrol.school_id and e.learner_id=v_enrol.learner_id
    and en.academic_year=v_enrol.academic_year;

  select count(*) into v_obligation_count
  from public.late_detention_obligations
  where school_id=v_enrol.school_id and learner_id=v_enrol.learner_id
    and academic_year=v_enrol.academic_year;

  if v_existing_event_id is null and floor(v_total_count::numeric / v_threshold)::integer > v_obligation_count then
    v_due_on := app_private.next_policy_weekday_after(p_arrival_date,v_detention_weekday);
    v_supervisor_id := app_private.pick_detention_supervisor(v_enrol.school_id,v_due_on);

    insert into public.late_detention_obligations(
      tenant_id,school_id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status,
      academic_year,triggered_on,original_due_on,trigger_event_id,assigned_staff_member_id
    ) values(
      v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,null,v_threshold,v_due_on,'pending',
      v_enrol.academic_year,p_arrival_date,v_due_on,v_event_id,v_supervisor_id
    ) returning id into v_obligation_id;

    if v_supervisor_id is not null then
      select user_id into v_supervisor_user_id from public.staff_members where id=v_supervisor_id;
      if v_supervisor_user_id is not null then
        insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title,body,href)
        values(
          v_supervisor_user_id,v_enrol.tenant_id,v_enrol.school_id,'info','Detention supervision assigned',
          'A learner detention obligation has been assigned to you for ' || to_char(v_due_on,'DD Mon YYYY') || '.',
          '/late-arrivals'
        );
      end if;
    end if;
  end if;

  v_progress := mod(v_total_count,v_threshold);
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'school_late_arrival.recorded','learner',v_enrol.learner_id,
    jsonb_build_object(
      'arrival_date',p_arrival_date,'academic_year',v_enrol.academic_year,'cumulative_late_count',v_total_count,
      'trigger_progress',v_progress,'threshold',v_threshold,'detention_obligation_id',v_obligation_id
    )
  );
  return v_event_id;
end;
$$;

revoke all on function public.record_school_late_arrival(uuid,date,time,text) from public,anon;
grant execute on function public.record_school_late_arrival(uuid,date,time,text) to authenticated;

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
    select id,assigned_staff_member_id
    from public.late_detention_obligations
    where school_id=p_school_id
      and status in ('pending','carried_forward')
      and due_on<p_reference_date
    order by due_on,id
    for update
  loop
    v_supervisor_id := v_item.assigned_staff_member_id;

    if v_supervisor_id is not null
      and not app_private.staff_member_has_school_assignment(v_supervisor_id,p_school_id,v_next_due) then
      v_supervisor_id := app_private.pick_detention_supervisor(p_school_id,v_next_due);
    end if;

    update public.late_detention_obligations
    set status='carried_forward',
        due_on=v_next_due,
        rollover_count=rollover_count+1,
        assigned_staff_member_id=v_supervisor_id,
        updated_at=now()
    where id=v_item.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon;
grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;

comment on function app_private.staff_member_has_school_assignment(uuid,uuid,date) is
'Returns whether an active staff identity has a governed placement at the school on the supplied operational date, accepting staff-school assignments and legacy staff-linked memberships.';
comment on function public.reassign_late_detention_supervisor(uuid,uuid) is
'Reassigns a pending late-detention obligation only to active staff placed at the school on the obligation due date.';
comment on function public.roll_forward_late_detentions(uuid,date) is
'Carries overdue obligations to the next configured detention day and replaces supervisors whose school placement does not cover the new due date.';
