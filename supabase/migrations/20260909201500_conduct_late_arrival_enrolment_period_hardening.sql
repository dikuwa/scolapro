-- Ensure historic late-arrival facts can only be recorded against an enrolment
-- that was effective on the asserted arrival date. Preserve the existing actor,
-- duty/role authorization, cumulative detention, notification and audit semantics.

create or replace function public.record_school_late_arrival(
  p_enrolment_id uuid,
  p_arrival_date date default current_date,
  p_arrived_at time without time zone default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
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
  if p_arrival_date > current_date then raise exception 'Future late-arrival dates are not allowed'; end if;

  select *
  into v_enrol
  from public.enrolments
  where id = p_enrolment_id
    and status = 'current'
    and enrolled_from <= p_arrival_date
    and (enrolled_to is null or enrolled_to >= p_arrival_date);

  if not found then raise exception 'Active learner enrolment not found for arrival date'; end if;

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
$function$;
