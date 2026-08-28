-- School late-arrival discipline is intentionally separate from statutory daily
-- attendance and subject-period attendance. Late events remain historical;
-- detention obligations can be completed, waived or carried forward.

create table if not exists public.school_duty_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  duty_key text not null,
  active_from date not null default current_date,
  active_to date,
  assigned_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (active_to is null or active_to >= active_from)
);
create unique index if not exists school_duty_active_unique on public.school_duty_assignments(school_id, staff_member_id, duty_key, active_from);
create index if not exists school_duty_lookup_idx on public.school_duty_assignments(school_id, duty_key, active_from, active_to);

create table if not exists public.school_late_arrival_policies (
  school_id uuid primary key references public.schools(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekly_threshold smallint not null default 3 check (weekly_threshold > 0),
  detention_weekday smallint not null default 5 check (detention_weekday between 1 and 7),
  carry_forward boolean not null default true,
  active boolean not null default true,
  updated_by_user_id uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_late_arrival_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  arrival_date date not null,
  arrived_at time,
  note text,
  recorded_by_user_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  source text not null default 'school_late_duty',
  created_at timestamptz not null default now(),
  unique (school_id, enrolment_id, arrival_date)
);
create index if not exists school_late_events_week_idx on public.school_late_arrival_events(school_id, arrival_date, learner_id);
create index if not exists school_late_events_learner_idx on public.school_late_arrival_events(learner_id, arrival_date desc);

create table if not exists public.late_detention_obligations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  qualifying_week_start date not null,
  qualifying_late_count smallint not null check (qualifying_late_count > 0),
  due_on date not null,
  status text not null default 'pending' check (status in ('pending','completed','carried_forward','waived')),
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, learner_id, qualifying_week_start)
);
create index if not exists late_detention_open_idx on public.late_detention_obligations(school_id, due_on, learner_id) where status in ('pending','carried_forward');

alter table public.school_duty_assignments enable row level security;
alter table public.school_late_arrival_policies enable row level security;
alter table public.school_late_arrival_events enable row level security;
alter table public.late_detention_obligations enable row level security;

create or replace function app_private.has_school_duty(p_school_id uuid, p_duty_key text, p_on_date date default current_date)
returns boolean language sql stable security definer set search_path=public,app_private as $$
  select exists (
    select 1 from public.school_duty_assignments d
    join public.staff_members sm on sm.id=d.staff_member_id
    where d.school_id=p_school_id and d.duty_key=p_duty_key
      and d.active_from <= p_on_date and (d.active_to is null or d.active_to >= p_on_date)
      and sm.user_id=auth.uid() and sm.status='active'
  );
$$;

create policy "school leaders manage duty assignments" on public.school_duty_assignments for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "assignees can read own duties" on public.school_duty_assignments for select to authenticated
using (exists(select 1 from public.staff_members sm where sm.id=staff_member_id and sm.user_id=auth.uid()));

create policy "school leaders manage late policy" on public.school_late_arrival_policies for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "late duty can read late policy" on public.school_late_arrival_policies for select to authenticated
using (app_private.has_school_duty(school_id,'late_arrival_recorder') or app_private.can_view_operational_learners(school_id));

create policy "authorized staff can read school late events" on public.school_late_arrival_events for select to authenticated
using (app_private.can_view_operational_learners(school_id) or app_private.has_school_duty(school_id,'late_arrival_recorder',arrival_date));
create policy "late duty can read detention obligations" on public.late_detention_obligations for select to authenticated
using (app_private.can_view_operational_learners(school_id) or app_private.has_school_duty(school_id,'late_arrival_recorder'));

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
  v_friday date;
  v_threshold smallint;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found or v_enrol.status <> 'current' then raise exception 'Active learner enrolment not found'; end if;
  if not (app_private.has_school_duty(v_enrol.school_id,'late_arrival_recorder',p_arrival_date) or app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal'])) then raise exception 'Permission denied'; end if;

  insert into public.school_late_arrival_policies(school_id,tenant_id) values(v_enrol.school_id,v_enrol.tenant_id) on conflict(school_id) do nothing;
  select weekly_threshold into v_threshold from public.school_late_arrival_policies where school_id=v_enrol.school_id and active=true;
  if v_threshold is null then raise exception 'Late arrival policy is not active'; end if;

  insert into public.school_late_arrival_events(tenant_id,school_id,learner_id,enrolment_id,arrival_date,arrived_at,note,recorded_by_user_id)
  values(v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,p_arrival_date,p_arrived_at,nullif(btrim(p_note),''),auth.uid())
  on conflict(school_id,enrolment_id,arrival_date) do update set arrived_at=excluded.arrived_at,note=excluded.note,recorded_by_user_id=auth.uid(),recorded_at=now()
  returning id into v_event_id;

  v_week_start := p_arrival_date - ((extract(isodow from p_arrival_date)::int)-1);
  v_friday := v_week_start + 4;
  select count(*) into v_count from public.school_late_arrival_events where school_id=v_enrol.school_id and learner_id=v_enrol.learner_id and arrival_date between v_week_start and v_week_start+4;

  if v_count >= v_threshold then
    insert into public.late_detention_obligations(tenant_id,school_id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status)
    values(v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_week_start,v_count,v_friday,'pending')
    on conflict(school_id,learner_id,qualifying_week_start) do update set qualifying_late_count=excluded.qualifying_late_count,updated_at=now();
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'school_late_arrival.recorded','learner',v_enrol.learner_id,jsonb_build_object('arrival_date',p_arrival_date,'week_late_count',v_count,'threshold',v_threshold));
  return v_event_id;
end;
$$;

create or replace function public.resolve_late_detention(p_obligation_id uuid,p_status text,p_note text default null)
returns boolean language plpgsql security definer set search_path=public,app_private as $$
declare v_item public.late_detention_obligations%rowtype;
begin
  if p_status not in ('completed','waived') then raise exception 'Resolution must be completed or waived'; end if;
  select * into v_item from public.late_detention_obligations where id=p_obligation_id;
  if not found then raise exception 'Detention obligation not found'; end if;
  if not (app_private.has_school_duty(v_item.school_id,'late_arrival_recorder') or app_private.has_school_role(v_item.school_id,array['school_admin','principal','deputy_principal'])) then raise exception 'Permission denied'; end if;
  update public.late_detention_obligations set status=p_status,completed_at=case when p_status='completed' then now() else null end,completed_by_user_id=auth.uid(),resolution_note=nullif(btrim(p_note),''),updated_at=now() where id=p_obligation_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(v_item.tenant_id,v_item.school_id,auth.uid(),'late_detention.resolved','learner',v_item.learner_id,jsonb_build_object('obligation_id',p_obligation_id,'status',p_status));
  return true;
end; $$;

create or replace function public.roll_forward_late_detentions(p_school_id uuid,p_reference_date date default current_date)
returns integer language plpgsql security definer set search_path=public,app_private as $$
declare v_count integer; v_next_friday date;
begin
  if not (app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_reference_date) or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])) then raise exception 'Permission denied'; end if;
  v_next_friday := p_reference_date + ((5 - extract(isodow from p_reference_date)::int + 7) % 7);
  if v_next_friday < p_reference_date then v_next_friday := v_next_friday + 7; end if;
  update public.late_detention_obligations set status='carried_forward',due_on=v_next_friday,updated_at=now() where school_id=p_school_id and status in ('pending','carried_forward') and due_on < p_reference_date;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke all on function public.record_school_late_arrival(uuid,date,time,text) from public,anon; grant execute on function public.record_school_late_arrival(uuid,date,time,text) to authenticated;
revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon; grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;
revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon; grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;
