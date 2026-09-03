-- Advance detention duty planning builds on the existing late-arrival obligations
-- and detention sessions. Obligations remain the durable discipline source record;
-- sessions remain the dated operational/attendance record.

create table if not exists public.detention_session_supervisors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  detention_session_id uuid not null references public.detention_sessions(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(detention_session_id, staff_member_id)
);

create index if not exists detention_session_supervisors_staff_date_lookup_idx
  on public.detention_session_supervisors(staff_member_id, detention_session_id);
create index if not exists detention_session_supervisors_school_session_idx
  on public.detention_session_supervisors(school_id, detention_session_id);

alter table public.detention_session_items
  add column if not exists assigned_supervisor_staff_member_id uuid
  references public.staff_members(id) on delete restrict;

create index if not exists detention_session_items_supervisor_idx
  on public.detention_session_items(assigned_supervisor_staff_member_id, detention_session_id)
  where assigned_supervisor_staff_member_id is not null;

-- Preserve legacy single-supervisor sessions as members of the new duty team.
insert into public.detention_session_supervisors(
  tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id
)
select ds.tenant_id,ds.school_id,ds.id,ds.supervisor_staff_member_id,ds.created_by_user_id
from public.detention_sessions ds
where ds.supervisor_staff_member_id is not null
on conflict(detention_session_id,staff_member_id) do nothing;

create or replace function app_private.enforce_detention_session_supervisor_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
begin
  select * into v_session
  from public.detention_sessions
  where id=new.detention_session_id;

  if not found then raise exception 'Detention session not found'; end if;
  if new.tenant_id<>v_session.tenant_id or new.school_id<>v_session.school_id then
    raise exception 'Detention supervisor scope must match session';
  end if;
  if not app_private.staff_member_has_school_assignment(new.staff_member_id,v_session.school_id,v_session.session_date) then
    raise exception 'Detention supervisor is not actively assigned to this school on the session date';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_detention_session_supervisor_scope() from public,anon,authenticated;

drop trigger if exists detention_session_supervisor_scope_trg on public.detention_session_supervisors;
create trigger detention_session_supervisor_scope_trg
before insert or update on public.detention_session_supervisors
for each row execute function app_private.enforce_detention_session_supervisor_scope();

create or replace function app_private.enforce_detention_session_item_supervisor_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if new.assigned_supervisor_staff_member_id is not null and not exists (
    select 1
    from public.detention_session_supervisors dss
    where dss.detention_session_id=new.detention_session_id
      and dss.staff_member_id=new.assigned_supervisor_staff_member_id
      and dss.school_id=new.school_id
      and dss.tenant_id=new.tenant_id
  ) then
    raise exception 'Learner supervisor must belong to the detention session duty team';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_detention_session_item_supervisor_scope() from public,anon,authenticated;

drop trigger if exists detention_session_item_supervisor_scope_trg on public.detention_session_items;
create trigger detention_session_item_supervisor_scope_trg
before insert or update of detention_session_id,assigned_supervisor_staff_member_id,school_id,tenant_id
on public.detention_session_items
for each row execute function app_private.enforce_detention_session_item_supervisor_scope();

alter table public.detention_session_supervisors enable row level security;

create policy "authorized staff read detention session duty teams"
on public.detention_session_supervisors for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or app_private.has_school_duty(school_id,'late_arrival_recorder')
  or exists (
    select 1 from public.staff_members sm
    where sm.id=staff_member_id and sm.user_id=(select auth.uid()) and sm.status='active'
  )
);

create or replace function app_private.can_supervise_detention_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists (
    select 1
    from public.detention_sessions ds
    join public.staff_members sm
      on sm.id=ds.supervisor_staff_member_id
     and sm.user_id=auth.uid()
     and sm.status='active'
    where ds.id=p_session_id
      and app_private.staff_member_has_school_assignment(sm.id,ds.school_id,ds.session_date)
  ) or exists (
    select 1
    from public.detention_session_supervisors dss
    join public.detention_sessions ds on ds.id=dss.detention_session_id
    join public.staff_members sm
      on sm.id=dss.staff_member_id
     and sm.user_id=auth.uid()
     and sm.status='active'
    where dss.detention_session_id=p_session_id
      and app_private.staff_member_has_school_assignment(sm.id,ds.school_id,ds.session_date)
  );
$$;

revoke all on function app_private.can_supervise_detention_session(uuid) from public,anon,authenticated;

create or replace function public.set_detention_session_supervisors(
  p_session_id uuid,
  p_staff_member_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_staff_id uuid;
  v_user_id uuid;
  v_added integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'Detention session not found'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Detention duty team can only be changed for planned or open sessions'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
  ) then raise exception 'Permission denied'; end if;

  if coalesce(cardinality(p_staff_member_ids),0)=0 then
    raise exception 'Choose at least one detention supervisor';
  end if;

  foreach v_staff_id in array p_staff_member_ids loop
    if not app_private.staff_member_has_school_assignment(v_staff_id,v_session.school_id,v_session.session_date) then
      raise exception 'A selected supervisor is not assigned to this school on the detention date';
    end if;
  end loop;

  -- Do not silently remove a supervisor who still owns learners in this session.
  if exists (
    select 1
    from public.detention_session_items dsi
    where dsi.detention_session_id=v_session.id
      and dsi.assigned_supervisor_staff_member_id is not null
      and not (dsi.assigned_supervisor_staff_member_id=any(p_staff_member_ids))
      and dsi.attendance_status='scheduled'
  ) then
    raise exception 'Reassign scheduled learners before removing a supervisor from the duty team';
  end if;

  delete from public.detention_session_supervisors dss
  where dss.detention_session_id=v_session.id
    and not (dss.staff_member_id=any(p_staff_member_ids));

  foreach v_staff_id in array p_staff_member_ids loop
    insert into public.detention_session_supervisors(
      tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id
    ) values(
      v_session.tenant_id,v_session.school_id,v_session.id,v_staff_id,auth.uid()
    ) on conflict(detention_session_id,staff_member_id) do nothing;

    if found then
      v_added := v_added + 1;
      select user_id into v_user_id from public.staff_members where id=v_staff_id;
      if v_user_id is not null then
        insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title,body,href)
        values(
          v_user_id,v_session.tenant_id,v_session.school_id,'info','Detention duty scheduled',
          'You are scheduled to supervise detention on ' || to_char(v_session.session_date,'DD Mon YYYY') || '.',
          '/late-arrivals'
        );
      end if;
    end if;
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_session.tenant_id,v_session.school_id,auth.uid(),'detention.session.supervisors_updated',
    'detention_session',v_session.id,
    jsonb_build_object('session_date',v_session.session_date,'staff_member_ids',p_staff_member_ids)
  );

  return v_added;
end;
$$;

revoke all on function public.set_detention_session_supervisors(uuid,uuid[]) from public,anon;
grant execute on function public.set_detention_session_supervisors(uuid,uuid[]) to authenticated;

create or replace function public.assign_detention_session_learners(
  p_session_id uuid,
  p_obligation_ids uuid[],
  p_supervisor_staff_member_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_obligation public.late_detention_obligations%rowtype;
  v_obligation_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'Detention session not found'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Learners can only be allocated to planned or open detention sessions'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
  ) then raise exception 'Permission denied'; end if;

  if not exists (
    select 1 from public.detention_session_supervisors
    where detention_session_id=v_session.id
      and staff_member_id=p_supervisor_staff_member_id
  ) then raise exception 'Choose a supervisor from this detention session duty team'; end if;

  if coalesce(cardinality(p_obligation_ids),0)=0 then raise exception 'Choose at least one learner detention obligation'; end if;

  foreach v_obligation_id in array p_obligation_ids loop
    select * into v_obligation
    from public.late_detention_obligations
    where id=v_obligation_id
    for update;

    if not found
      or v_obligation.school_id<>v_session.school_id
      or v_obligation.tenant_id<>v_session.tenant_id
      or v_obligation.status not in ('pending','carried_forward')
      or v_obligation.due_on>v_session.session_date then
      raise exception 'A selected detention obligation is not eligible for this session';
    end if;

    insert into public.detention_session_items(
      tenant_id,school_id,detention_session_id,obligation_id,learner_id,assigned_supervisor_staff_member_id
    ) values(
      v_obligation.tenant_id,v_obligation.school_id,v_session.id,v_obligation.id,v_obligation.learner_id,p_supervisor_staff_member_id
    )
    on conflict(detention_session_id,obligation_id) do update
      set assigned_supervisor_staff_member_id=excluded.assigned_supervisor_staff_member_id
    where public.detention_session_items.attendance_status='scheduled';

    if found then v_count := v_count + 1; end if;

    -- Keep the established obligation self-scoped read/completion model compatible.
    update public.late_detention_obligations
    set assigned_staff_member_id=p_supervisor_staff_member_id,updated_at=now()
    where id=v_obligation.id;
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_session.tenant_id,v_session.school_id,auth.uid(),'detention.session.learners_allocated',
    'detention_session',v_session.id,
    jsonb_build_object(
      'session_date',v_session.session_date,
      'supervisor_staff_member_id',p_supervisor_staff_member_id,
      'obligation_ids',p_obligation_ids,
      'learner_count',v_count
    )
  );

  return v_count;
end;
$$;

revoke all on function public.assign_detention_session_learners(uuid,uuid[],uuid) from public,anon;
grant execute on function public.assign_detention_session_learners(uuid,uuid[],uuid) to authenticated;

comment on table public.detention_session_supervisors is
'One or more date-valid school staff scheduled to supervise a detention session. Staff accounts are optional; account-linked staff receive an in-app duty notification.';
comment on column public.detention_session_items.assigned_supervisor_staff_member_id is
'The duty-team member responsible for this learner during the detention session. Bulk allocation may group learners/classes without changing the underlying late-detention obligation provenance.';
