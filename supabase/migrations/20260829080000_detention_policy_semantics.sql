-- Honor the configured detention weekday and carry-forward switch. The original
-- workflow exposed both settings but operational functions still hard-coded Friday.

create or replace function app_private.next_policy_weekday(
  p_reference_date date,
  p_iso_weekday smallint
)
returns date
language sql
immutable
set search_path=public
as $$
  select p_reference_date
    + ((p_iso_weekday::integer - extract(isodow from p_reference_date)::integer + 7) % 7);
$$;
revoke all on function app_private.next_policy_weekday(date,smallint) from public,anon,authenticated;

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
  v_week_start date;
  v_due_on date;
  v_threshold smallint;
  v_detention_weekday smallint;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found or v_enrol.status <> 'current' then raise exception 'Active learner enrolment not found'; end if;
  if not (
    app_private.has_school_duty(v_enrol.school_id,'late_arrival_recorder',p_arrival_date)
    or app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  insert into public.school_late_arrival_policies(school_id,tenant_id)
  values(v_enrol.school_id,v_enrol.tenant_id)
  on conflict(school_id) do nothing;

  select weekly_threshold,detention_weekday
  into v_threshold,v_detention_weekday
  from public.school_late_arrival_policies
  where school_id=v_enrol.school_id and active=true;

  if v_threshold is null or v_detention_weekday is null then
    raise exception 'Late arrival policy is not active';
  end if;

  insert into public.school_late_arrival_events(
    tenant_id,school_id,learner_id,enrolment_id,arrival_date,arrived_at,note,recorded_by_user_id
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,p_arrival_date,
    p_arrived_at,nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  )
  on conflict(school_id,enrolment_id,arrival_date) do update
  set arrived_at=excluded.arrived_at,
      note=excluded.note,
      recorded_by_user_id=auth.uid(),
      recorded_at=now()
  returning id into v_event_id;

  v_week_start := p_arrival_date - ((extract(isodow from p_arrival_date)::int)-1);

  select count(*) into v_count
  from public.school_late_arrival_events
  where school_id=v_enrol.school_id
    and learner_id=v_enrol.learner_id
    and arrival_date between v_week_start and v_week_start+4;

  if v_count >= v_threshold then
    v_due_on := v_week_start + (v_detention_weekday::integer - 1);
    if v_due_on < p_arrival_date then
      v_due_on := v_due_on + 7;
    end if;

    insert into public.late_detention_obligations(
      tenant_id,school_id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status
    ) values(
      v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_week_start,v_count,v_due_on,'pending'
    )
    on conflict(school_id,learner_id,qualifying_week_start) do update
    set qualifying_late_count=excluded.qualifying_late_count,
        due_on=case
          when public.late_detention_obligations.status in ('pending','carried_forward')
            then excluded.due_on
          else public.late_detention_obligations.due_on
        end,
        updated_at=now();
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'school_late_arrival.recorded','learner',v_enrol.learner_id,
    jsonb_build_object(
      'arrival_date',p_arrival_date,
      'week_late_count',v_count,
      'threshold',v_threshold,
      'detention_weekday',v_detention_weekday
    )
  );

  return v_event_id;
end;
$$;

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('completed','waived') then raise exception 'Resolution must be completed or waived'; end if;

  select * into v_item
  from public.late_detention_obligations
  where id=p_obligation_id
  for update;

  if not found then raise exception 'Detention obligation not found'; end if;
  if not (
    app_private.has_school_duty(v_item.school_id,'late_arrival_recorder')
    or app_private.has_school_role(v_item.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;
  if v_item.status in ('completed','waived') then raise exception 'Detention obligation is already resolved'; end if;

  update public.late_detention_obligations
  set status=p_status,
      completed_at=case when p_status='completed' then now() else null end,
      completed_by_user_id=auth.uid(),
      resolution_note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_item.tenant_id,v_item.school_id,auth.uid(),'late_detention.resolved','learner',v_item.learner_id,
    jsonb_build_object('obligation_id',p_obligation_id,'status',p_status,'previous_status',v_item.status)
  );

  return true;
end;
$$;

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
  v_count integer;
  v_next_due date;
  v_detention_weekday smallint;
  v_carry_forward boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_reference_date)
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  select detention_weekday,carry_forward
  into v_detention_weekday,v_carry_forward
  from public.school_late_arrival_policies
  where school_id=p_school_id and active=true;

  if v_detention_weekday is null then raise exception 'Late arrival policy is not active'; end if;
  if not v_carry_forward then return 0; end if;

  v_next_due := app_private.next_policy_weekday(p_reference_date,v_detention_weekday);

  update public.late_detention_obligations
  set status='carried_forward',
      due_on=v_next_due,
      updated_at=now()
  where school_id=p_school_id
    and status in ('pending','carried_forward')
    and due_on < p_reference_date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_school_late_arrival(uuid,date,time,text) from public,anon;
grant execute on function public.record_school_late_arrival(uuid,date,time,text) to authenticated;
revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon;
grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;
revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon;
grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;

comment on function public.roll_forward_late_detentions(uuid,date) is
'Carries unresolved obligations to the school-configured detention weekday only when carry_forward is enabled.';