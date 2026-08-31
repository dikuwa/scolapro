-- Late-arrival detention is cumulative across the academic year, not weekly.
-- Every threshold-sized block of late arrivals creates its own durable obligation.

alter table public.school_late_arrival_policies
  add column if not exists cumulative_threshold smallint not null default 3 check (cumulative_threshold > 0);

alter table public.late_detention_obligations
  alter column qualifying_week_start drop not null,
  add column if not exists academic_year integer,
  add column if not exists triggered_on date,
  add column if not exists original_due_on date,
  add column if not exists trigger_event_id uuid references public.school_late_arrival_events(id) on delete restrict,
  add column if not exists assigned_staff_member_id uuid references public.staff_members(id) on delete restrict,
  add column if not exists rollover_count integer not null default 0 check (rollover_count >= 0);

alter table public.late_detention_obligations
  drop constraint if exists late_detention_obligations_school_id_learner_id_qualifying_week_start_key;

create unique index if not exists late_detention_trigger_event_unique
  on public.late_detention_obligations(trigger_event_id)
  where trigger_event_id is not null;
create index if not exists late_detention_learner_year_idx
  on public.late_detention_obligations(school_id, learner_id, academic_year, created_at);
create index if not exists late_detention_supervisor_due_idx
  on public.late_detention_obligations(assigned_staff_member_id, due_on)
  where status in ('pending','carried_forward') and assigned_staff_member_id is not null;

update public.late_detention_obligations
set triggered_on = coalesce(triggered_on, qualifying_week_start),
    original_due_on = coalesce(original_due_on, due_on),
    academic_year = coalesce(academic_year, extract(year from coalesce(triggered_on, qualifying_week_start, due_on))::integer)
where triggered_on is null or original_due_on is null or academic_year is null;

create table if not exists public.detention_supervision_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  eligible boolean not null default true,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(school_id, staff_member_id)
);

alter table public.detention_supervision_preferences enable row level security;
create policy "school members read detention supervision preferences"
on public.detention_supervision_preferences for select to authenticated
using (app_private.has_school_access(school_id));
create policy "school leaders manage detention supervision preferences"
on public.detention_supervision_preferences for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));

grant select,insert,update,delete on public.detention_supervision_preferences to authenticated;
revoke all on public.detention_supervision_preferences from anon;

create or replace function app_private.next_policy_weekday_after(
  p_reference_date date,
  p_iso_weekday smallint
)
returns date
language sql
immutable
set search_path=public
as $$
  select p_reference_date
    + case
        when ((p_iso_weekday::integer - extract(isodow from p_reference_date)::integer + 7) % 7) = 0 then 7
        else ((p_iso_weekday::integer - extract(isodow from p_reference_date)::integer + 7) % 7)
      end;
$$;
revoke all on function app_private.next_policy_weekday_after(date,smallint) from public,anon,authenticated;

create or replace function app_private.pick_detention_supervisor(
  p_school_id uuid,
  p_on_date date
)
returns uuid
language sql
stable
security definer
set search_path=public,app_private
as $$
  select ssa.staff_member_id
  from public.staff_school_assignments ssa
  join public.staff_members sm on sm.id=ssa.staff_member_id and sm.status='active'
  left join public.detention_supervision_preferences dsp
    on dsp.school_id=ssa.school_id and dsp.staff_member_id=ssa.staff_member_id
  left join lateral (
    select count(*)::integer as assignment_count, max(o.created_at) as last_assigned_at
    from public.late_detention_obligations o
    where o.school_id=p_school_id and o.assigned_staff_member_id=ssa.staff_member_id
  ) history on true
  where ssa.school_id=p_school_id
    and ssa.effective_from<=p_on_date
    and (ssa.effective_to is null or ssa.effective_to>=p_on_date)
    and coalesce(dsp.eligible,true)=true
  order by coalesce(history.assignment_count,0) asc,
           history.last_assigned_at asc nulls first,
           sm.last_name asc,
           sm.first_name asc,
           ssa.staff_member_id
  limit 1;
$$;
revoke all on function app_private.pick_detention_supervisor(uuid,date) from public,anon,authenticated;

create or replace function public.set_detention_supervision_eligibility(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_eligible boolean
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  select s.tenant_id into v_tenant_id
  from public.staff_school_assignments ssa
  join public.schools s on s.id=ssa.school_id
  where ssa.school_id=p_school_id and ssa.staff_member_id=p_staff_member_id
    and ssa.effective_from<=current_date and (ssa.effective_to is null or ssa.effective_to>=current_date)
  limit 1;
  if v_tenant_id is null then raise exception 'Active staff assignment not found for school'; end if;

  insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible,updated_by_user_id)
  values(v_tenant_id,p_school_id,p_staff_member_id,p_eligible,auth.uid())
  on conflict(school_id,staff_member_id) do update
  set eligible=excluded.eligible,updated_by_user_id=auth.uid(),updated_at=now();
  return true;
end;
$$;
revoke all on function public.set_detention_supervision_eligibility(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_detention_supervision_eligibility(uuid,uuid,boolean) to authenticated;

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
  v_valid boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_item from public.late_detention_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Detention obligation not found'; end if;
  if not app_private.has_school_role(v_item.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  select exists(
    select 1 from public.staff_school_assignments ssa
    join public.staff_members sm on sm.id=ssa.staff_member_id and sm.status='active'
    where ssa.school_id=v_item.school_id and ssa.staff_member_id=p_staff_member_id
      and ssa.effective_from<=current_date and (ssa.effective_to is null or ssa.effective_to>=current_date)
  ) into v_valid;
  if not v_valid then raise exception 'Active staff assignment not found for school'; end if;

  update public.late_detention_obligations
  set assigned_staff_member_id=p_staff_member_id,updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_item.tenant_id,v_item.school_id,auth.uid(),'late_detention.supervisor_reassigned','late_detention_obligation',v_item.id,
    jsonb_build_object('staff_member_id',p_staff_member_id));
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
    v_supervisor_id := app_private.pick_detention_supervisor(v_enrol.school_id,p_arrival_date);

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
        values(v_supervisor_user_id,v_enrol.tenant_id,v_enrol.school_id,'info','Detention supervision assigned',
          'A learner detention obligation has been assigned to you for ' || to_char(v_due_on,'DD Mon YYYY') || '.',
          '/late-arrivals');
      end if;
    end if;
  end if;

  v_progress := mod(v_total_count,v_threshold);
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'school_late_arrival.recorded','learner',v_enrol.learner_id,
    jsonb_build_object('arrival_date',p_arrival_date,'academic_year',v_enrol.academic_year,'cumulative_late_count',v_total_count,
      'trigger_progress',v_progress,'threshold',v_threshold,'detention_obligation_id',v_obligation_id));
  return v_event_id;
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

  select detention_weekday,carry_forward into v_detention_weekday,v_carry_forward
  from public.school_late_arrival_policies where school_id=p_school_id and active=true;
  if v_detention_weekday is null then raise exception 'Late arrival policy is not active'; end if;
  if not v_carry_forward then return 0; end if;

  v_next_due := app_private.next_policy_weekday_after(p_reference_date,v_detention_weekday);
  update public.late_detention_obligations
  set status='carried_forward',due_on=v_next_due,rollover_count=rollover_count+1,updated_at=now()
  where school_id=p_school_id and status in ('pending','carried_forward') and due_on<p_reference_date;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.record_school_late_arrival(uuid,date,time,text) from public,anon;
grant execute on function public.record_school_late_arrival(uuid,date,time,text) to authenticated;
revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon;
grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;

comment on column public.school_late_arrival_policies.cumulative_threshold is
'Number of cumulative late arrivals in an academic year that creates each independent detention obligation.';
comment on table public.detention_supervision_preferences is
'Per-school opt-out/eligibility overrides for automatic detention supervisor rotation. Absence of a row means eligible.';
