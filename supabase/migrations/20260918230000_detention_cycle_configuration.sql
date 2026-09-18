-- Issue #493 / Stream A: flexible detention cycle configuration.
--
-- Extend the existing school_late_arrival_policies row. Detention sessions remain
-- the single operational roster model. The legacy detention_weekday column is
-- retained for compatibility; detention_weekdays is authoritative when set.
-- Manual mode creates obligations immediately eligible for an authorised
-- manually planned future session and does not auto-roll dates.

alter table public.school_late_arrival_policies
  add column if not exists detention_schedule_mode text not null default 'configured_days',
  add column if not exists detention_weekdays smallint[];

alter table public.school_late_arrival_policies
  drop constraint if exists school_late_arrival_policies_detention_schedule_mode_check,
  add constraint school_late_arrival_policies_detention_schedule_mode_check
    check (detention_schedule_mode in ('configured_days','manual')),
  drop constraint if exists school_late_arrival_policies_detention_weekdays_check,
  add constraint school_late_arrival_policies_detention_weekdays_check
    check (
      detention_weekdays is null
      or (
        cardinality(detention_weekdays) between 1 and 7
        and detention_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      )
    );

update public.school_late_arrival_policies
set detention_weekdays = array[detention_weekday]::smallint[]
where detention_schedule_mode = 'configured_days'
  and detention_weekdays is null;

create or replace function app_private.next_detention_cycle_date(
  p_reference_date date,
  p_schedule_mode text,
  p_weekdays smallint[],
  p_legacy_weekday smallint
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_days smallint[];
  v_offset integer;
begin
  if p_schedule_mode = 'manual' then
    return p_reference_date;
  end if;

  v_days := coalesce(
    nullif(p_weekdays, array[]::smallint[]),
    array[p_legacy_weekday]::smallint[]
  );

  select min(step)
    into v_offset
  from generate_series(1,7) step
  where extract(isodow from p_reference_date + step)::smallint = any(v_days);

  if v_offset is null then
    raise exception 'Configured detention days are invalid';
  end if;

  return p_reference_date + v_offset;
end;
$$;

revoke all on function app_private.next_detention_cycle_date(date,text,smallint[],smallint)
from public,anon,authenticated;

create or replace function public.update_detention_cycle_configuration(
  p_school_id uuid,
  p_schedule_mode text,
  p_weekdays smallint[] default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tenant_id uuid;
  v_days smallint[];
  v_primary smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_current_detention_school(p_school_id) then
    raise exception 'Permission denied';
  end if;
  if p_schedule_mode not in ('configured_days','manual') then
    raise exception 'Invalid detention schedule mode';
  end if;

  if p_schedule_mode = 'configured_days' then
    select coalesce(array_agg(day order by day), array[]::smallint[])
      into v_days
    from (
      select distinct value::smallint as day
      from unnest(coalesce(p_weekdays,array[]::smallint[])) value
      where value between 1 and 7
    ) valid_days;

    if cardinality(v_days) = 0 then
      raise exception 'Choose at least one detention day';
    end if;
    v_primary := v_days[1];
  else
    v_days := null;
    v_primary := null;
  end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id = p_school_id;

  if v_tenant_id is null then raise exception 'School not found'; end if;

  insert into public.school_late_arrival_policies(
    school_id,tenant_id,detention_weekday,detention_schedule_mode,detention_weekdays,
    updated_by_user_id,updated_at
  ) values(
    p_school_id,v_tenant_id,coalesce(v_primary,5),p_schedule_mode,v_days,
    auth.uid(),now()
  )
  on conflict(school_id) do update
  set detention_schedule_mode = excluded.detention_schedule_mode,
      detention_weekdays = excluded.detention_weekdays,
      detention_weekday = case
        when excluded.detention_schedule_mode = 'configured_days'
          then excluded.detention_weekday
        else public.school_late_arrival_policies.detention_weekday
      end,
      updated_by_user_id = auth.uid(),
      updated_at = now();

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),
    'detention.cycle.configuration_updated','school',p_school_id,
    jsonb_build_object(
      'schedule_mode',p_schedule_mode,
      'weekdays',coalesce(to_jsonb(v_days),'[]'::jsonb)
    )
  );

  return true;
end;
$$;

revoke all on function public.update_detention_cycle_configuration(uuid,text,smallint[])
from public,anon;
grant execute on function public.update_detention_cycle_configuration(uuid,text,smallint[])
to authenticated;

create or replace function public.record_school_late_arrival_wave2_unscoped(
  p_enrolment_id uuid,
  p_arrival_date date default current_date,
  p_arrived_at time default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_enrol public.enrolments%rowtype;
  v_event_id uuid;
  v_existing_event_id uuid;
  v_threshold smallint;
  v_detention_weekday smallint;
  v_schedule_mode text;
  v_weekdays smallint[];
  v_total_count integer;
  v_obligation_count integer;
  v_progress integer;
  v_due_on date;
  v_supervisor_id uuid;
  v_supervisor_user_id uuid;
  v_obligation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_arrival_date > current_date then raise exception 'Future late-arrival dates are not allowed'; end if;

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

  select
    cumulative_threshold,
    detention_weekday,
    detention_schedule_mode,
    detention_weekdays
  into
    v_threshold,
    v_detention_weekday,
    v_schedule_mode,
    v_weekdays
  from public.school_late_arrival_policies
  where school_id=v_enrol.school_id and active=true;

  if v_threshold is null or v_detention_weekday is null then
    raise exception 'Late arrival policy is not active';
  end if;

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
  set arrived_at=excluded.arrived_at,
      note=excluded.note,
      recorded_by_user_id=auth.uid(),
      recorded_at=now()
  returning id into v_event_id;

  select count(*) into v_total_count
  from public.school_late_arrival_events e
  join public.enrolments en on en.id=e.enrolment_id
  where e.school_id=v_enrol.school_id
    and e.learner_id=v_enrol.learner_id
    and en.academic_year=v_enrol.academic_year;

  select count(*) into v_obligation_count
  from public.late_detention_obligations
  where school_id=v_enrol.school_id
    and learner_id=v_enrol.learner_id
    and academic_year=v_enrol.academic_year;

  if v_existing_event_id is null
     and floor(v_total_count::numeric / v_threshold)::integer > v_obligation_count then
    v_due_on := app_private.next_detention_cycle_date(
      p_arrival_date,
      coalesce(v_schedule_mode,'configured_days'),
      v_weekdays,
      v_detention_weekday
    );
    v_supervisor_id := app_private.pick_detention_supervisor(v_enrol.school_id,p_arrival_date);

    insert into public.late_detention_obligations(
      tenant_id,school_id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status,
      academic_year,triggered_on,original_due_on,trigger_event_id,assigned_staff_member_id
    ) values(
      v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,null,v_threshold,v_due_on,'pending',
      v_enrol.academic_year,p_arrival_date,v_due_on,v_event_id,v_supervisor_id
    ) returning id into v_obligation_id;

    if v_supervisor_id is not null then
      select user_id into v_supervisor_user_id
      from public.staff_members
      where id=v_supervisor_id;

      if v_supervisor_user_id is not null then
        insert into public.notifications(
          recipient_user_id,tenant_id,school_id,severity,title,body,href
        ) values(
          v_supervisor_user_id,v_enrol.tenant_id,v_enrol.school_id,'info',
          'Detention supervision assigned',
          case
            when coalesce(v_schedule_mode,'configured_days')='manual'
              then 'A learner detention obligation has been assigned to you for manual scheduling.'
            else 'A learner detention obligation has been assigned to you for ' || to_char(v_due_on,'DD Mon YYYY') || '.'
          end,
          '/late-arrivals'
        );
      end if;
    end if;
  end if;

  v_progress := mod(v_total_count,v_threshold);
  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),
    'school_late_arrival.recorded','learner',v_enrol.learner_id,
    jsonb_build_object(
      'arrival_date',p_arrival_date,
      'academic_year',v_enrol.academic_year,
      'cumulative_late_count',v_total_count,
      'trigger_progress',v_progress,
      'threshold',v_threshold,
      'detention_obligation_id',v_obligation_id,
      'detention_schedule_mode',coalesce(v_schedule_mode,'configured_days'),
      'detention_weekdays',coalesce(to_jsonb(v_weekdays),to_jsonb(array[v_detention_weekday]::smallint[]))
    )
  );

  return v_event_id;
end;
$$;

revoke all on function public.record_school_late_arrival_wave2_unscoped(uuid,date,time,text)
from public,anon,authenticated;

create or replace function public.roll_forward_late_detentions_wave2_unscoped(
  p_school_id uuid,
  p_reference_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_count integer;
  v_next_due date;
  v_detention_weekday smallint;
  v_schedule_mode text;
  v_weekdays smallint[];
  v_carry_forward boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not (
    app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_reference_date)
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  select detention_weekday,detention_schedule_mode,detention_weekdays,carry_forward
    into v_detention_weekday,v_schedule_mode,v_weekdays,v_carry_forward
  from public.school_late_arrival_policies
  where school_id=p_school_id and active=true;

  if v_detention_weekday is null then raise exception 'Late arrival policy is not active'; end if;
  if not v_carry_forward or coalesce(v_schedule_mode,'configured_days')='manual' then
    return 0;
  end if;

  v_next_due := app_private.next_detention_cycle_date(
    p_reference_date,
    'configured_days',
    v_weekdays,
    v_detention_weekday
  );

  update public.late_detention_obligations
  set status='carried_forward',
      due_on=v_next_due,
      rollover_count=rollover_count+1,
      updated_at=now()
  where school_id=p_school_id
    and status in ('pending','carried_forward')
    and due_on<p_reference_date;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.roll_forward_late_detentions_wave2_unscoped(uuid,date)
from public,anon,authenticated;

comment on column public.school_late_arrival_policies.detention_schedule_mode is
'configured_days uses one or more school-selected weekdays; manual leaves session dates entirely to authorised roster planning.';
comment on column public.school_late_arrival_policies.detention_weekdays is
'Optional ordered/normalised ISO weekdays (1=Monday..7=Sunday). Null falls back to legacy detention_weekday for compatibility.';
comment on function public.update_detention_cycle_configuration(uuid,text,smallint[]) is
'Current-school leadership configuration boundary for detention scheduling only; does not mutate official attendance or create sessions.';
