-- Issue #486 / Stream B: advance detention roster planning.
--
-- Reuse the canonical detention session + duty-team model. No parallel roster is
-- introduced. This slice adds recipient-specific lifecycle notifications,
-- rescheduling of the same future roster, and a self-scoped upcoming-duty read
-- that exists before learners are attached.
--
-- The school detention cycle already lives in school_late_arrival_policies
-- (detention_weekday). Application planning now consumes that setting instead of
-- hard-coding Friday.

create or replace function app_private.notify_detention_staff(
  p_staff_member_id uuid,
  p_tenant_id uuid,
  p_school_id uuid,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid;
begin
  select sm.user_id
    into v_user_id
    from public.staff_members sm
   where sm.id = p_staff_member_id
     and sm.tenant_id = p_tenant_id
     and sm.status = 'active';

  if v_user_id is null then
    return;
  end if;

  if exists (
    select 1
      from public.platform_memberships pm
     where pm.user_id = v_user_id
       and pm.role_key = 'platform_support'
       and pm.active_from <= current_date
       and (pm.active_to is null or pm.active_to >= current_date)
  ) then
    return;
  end if;

  insert into public.notifications(
    recipient_user_id,tenant_id,school_id,severity,title,body,href
  ) values(
    v_user_id,p_tenant_id,p_school_id,'info',p_title,p_body,'/my-detention-supervision'
  );
end;
$$;

revoke all on function app_private.notify_detention_staff(uuid,uuid,uuid,text,text)
from public,anon,authenticated;

create or replace function public.set_detention_session_supervisors(
  p_session_id uuid,
  p_staff_member_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_previous uuid[] := array[]::uuid[];
  v_staff_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date) then
    raise exception 'Permission denied';
  end if;

  select coalesce(array_agg(dss.staff_member_id order by dss.staff_member_id),array[]::uuid[])
    into v_previous
    from public.detention_session_supervisors dss
   where dss.detention_session_id = v_session.id;

  v_count := public.set_detention_session_supervisors_wave2_unscoped(
    p_session_id,p_staff_member_ids
  );

  for v_staff_id in
    select value from unnest(p_staff_member_ids) selected(value)
    except
    select value from unnest(v_previous) prior(value)
  loop
    perform app_private.notify_detention_staff(
      v_staff_id,v_session.tenant_id,v_session.school_id,
      'Detention duty scheduled',
      format(
        'You were added to detention duty on %s%s.',
        to_char(v_session.session_date,'Dy DD Mon YYYY'),
        case when v_session.location is null then '' else format(' at %s',v_session.location) end
      )
    );
  end loop;

  for v_staff_id in
    select value from unnest(v_previous) prior(value)
    except
    select value from unnest(p_staff_member_ids) selected(value)
  loop
    perform app_private.notify_detention_staff(
      v_staff_id,v_session.tenant_id,v_session.school_id,
      'Detention duty removed',
      format('You are no longer rostered for detention duty on %s.',to_char(v_session.session_date,'Dy DD Mon YYYY'))
    );
  end loop;

  return v_count;
end;
$$;

revoke all on function public.set_detention_session_supervisors(uuid,uuid[])
from public,anon;
grant execute on function public.set_detention_session_supervisors(uuid,uuid[])
to authenticated;

create or replace function public.assign_detention_session_learners(
  p_session_id uuid,
  p_obligation_ids uuid[],
  p_supervisor_staff_member_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id = p_session_id;

  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date) then
    raise exception 'Permission denied';
  end if;

  v_count := public.assign_detention_session_learners_wave2_unscoped(
    p_session_id,p_obligation_ids,p_supervisor_staff_member_id
  );

  if v_count > 0 then
    perform app_private.notify_detention_staff(
      p_supervisor_staff_member_id,v_session.tenant_id,v_session.school_id,
      'Detention learners assigned',
      format(
        '%s learner%s %s attached to your detention duty on %s.',
        v_count,
        case when v_count = 1 then '' else 's' end,
        case when v_count = 1 then 'was' else 'were' end,
        to_char(v_session.session_date,'Dy DD Mon YYYY')
      )
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.assign_detention_session_learners(uuid,uuid[],uuid)
from public,anon;
grant execute on function public.assign_detention_session_learners(uuid,uuid[],uuid)
to authenticated;

create or replace function public.reschedule_detention_session_plan(
  p_session_id uuid,
  p_session_date date,
  p_starts_at time without time zone default null,
  p_ends_at time without time zone default null,
  p_location text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_staff_id uuid;
  v_latest_due date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_session_date is null or p_session_date < current_date then
    raise exception 'Past detention sessions cannot be planned';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Detention end time must be after the start time';
  end if;

  select * into v_session
  from public.detention_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'Detention session not found'; end if;
  if v_session.status not in ('planned','open') then
    raise exception 'Only planned or open detention sessions can be rescheduled';
  end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,p_session_date) then
    raise exception 'Permission denied';
  end if;

  for v_staff_id in
    select dss.staff_member_id
    from public.detention_session_supervisors dss
    where dss.detention_session_id = v_session.id
  loop
    if not app_private.staff_member_has_school_assignment(
      v_staff_id,v_session.school_id,p_session_date
    ) then
      raise exception 'A selected supervisor is not assigned to this school on the rescheduled detention date';
    end if;
  end loop;

  select max(o.due_on)
    into v_latest_due
    from public.detention_session_items dsi
    join public.late_detention_obligations o on o.id = dsi.obligation_id
   where dsi.detention_session_id = v_session.id
     and dsi.attendance_status = 'scheduled';

  if v_latest_due is not null and p_session_date < v_latest_due then
    raise exception 'The rescheduled detention date is earlier than an attached learner obligation due date';
  end if;

  update public.detention_sessions
     set session_date = p_session_date,
         starts_at = p_starts_at,
         ends_at = p_ends_at,
         location = nullif(btrim(coalesce(p_location,'')),''),
         updated_at = now()
   where id = v_session.id;

  for v_staff_id in
    select dss.staff_member_id
    from public.detention_session_supervisors dss
    where dss.detention_session_id = v_session.id
  loop
    perform app_private.notify_detention_staff(
      v_staff_id,v_session.tenant_id,v_session.school_id,
      'Detention duty rescheduled',
      format(
        'Your detention duty moved from %s to %s%s.',
        to_char(v_session.session_date,'Dy DD Mon YYYY'),
        to_char(p_session_date,'Dy DD Mon YYYY'),
        case when nullif(btrim(coalesce(p_location,'')),'') is null then '' else format(' at %s',btrim(p_location)) end
      )
    );
  end loop;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_session.tenant_id,v_session.school_id,auth.uid(),
    'detention.session.rescheduled','detention_session',v_session.id,
    jsonb_build_object(
      'previous_session_date',v_session.session_date,
      'session_date',p_session_date,
      'previous_starts_at',v_session.starts_at,
      'starts_at',p_starts_at,
      'previous_ends_at',v_session.ends_at,
      'ends_at',p_ends_at,
      'previous_location',v_session.location,
      'location',nullif(btrim(coalesce(p_location,'')),'')
    )
  );

  return true;
end;
$$;

revoke all on function public.reschedule_detention_session_plan(uuid,date,time without time zone,time without time zone,text)
from public,anon;
grant execute on function public.reschedule_detention_session_plan(uuid,date,time without time zone,time without time zone,text)
to authenticated;

create or replace function public.list_my_upcoming_detention_sessions()
returns table(
  session_id uuid,
  school_id uuid,
  session_date date,
  starts_at time without time zone,
  ends_at time without time zone,
  location text,
  status text,
  learner_count bigint,
  team_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select
    ds.id,
    ds.school_id,
    ds.session_date,
    ds.starts_at,
    ds.ends_at,
    ds.location,
    ds.status,
    (
      select count(*)
      from public.detention_session_items dsi
      where dsi.detention_session_id = ds.id
        and dsi.attendance_status = 'scheduled'
    ) as learner_count,
    (
      select count(*)
      from public.detention_session_supervisors dss
      where dss.detention_session_id = ds.id
    ) as team_count
  from public.detention_sessions ds
  where auth.uid() is not null
    and ds.status in ('planned','open')
    and ds.session_date >= current_date
    and ds.session_date <= current_date + 120
    and app_private.can_supervise_current_detention_session(ds.id)
  order by ds.session_date,ds.starts_at nulls last,ds.id;
$$;

revoke all on function public.list_my_upcoming_detention_sessions()
from public,anon;
grant execute on function public.list_my_upcoming_detention_sessions()
to authenticated;

comment on function public.reschedule_detention_session_plan(uuid,date,time without time zone,time without time zone,text) is
'Reschedules the same planned/open detention roster after validating coordinator authority, team placement and attached learner due dates; preserves audit provenance and notifies only rostered teachers.';
comment on function public.list_my_upcoming_detention_sessions() is
'Self-scoped upcoming detention duty read. A rostered teacher sees the session before learners are attached; later learner allocation updates the count on the same session rather than creating another roster.';
