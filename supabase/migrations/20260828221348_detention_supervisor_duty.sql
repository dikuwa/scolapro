-- Detention supervision is a distinct delegated school duty. Late-arrival recording
-- remains separate so assigning detention supervision does not imply authority to
-- capture late-arrival events.

create or replace function app_private.can_operate_detention_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists (
    select 1
    from public.detention_sessions ds
    where ds.id = p_session_id
      and (
        app_private.has_school_role(ds.school_id,array['school_admin','principal','deputy_principal'])
        or app_private.has_school_duty(ds.school_id,'detention_supervisor',ds.session_date)
        or exists (
          select 1
          from public.staff_members sm
          where sm.id = ds.supervisor_staff_member_id
            and sm.user_id = auth.uid()
            and sm.status = 'active'
        )
      )
  );
$$;
revoke all on function app_private.can_operate_detention_session(uuid) from public,anon,authenticated;

-- Rebuild read policies with the explicit detention-supervisor duty.
drop policy if exists "authorized staff read detention sessions" on public.detention_sessions;
create policy "authorized staff read detention sessions" on public.detention_sessions
for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or app_private.has_school_duty(school_id,'detention_supervisor',session_date)
  or exists (
    select 1 from public.staff_members sm
    where sm.id = supervisor_staff_member_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
  )
);

drop policy if exists "authorized staff read detention session items" on public.detention_session_items;
create policy "authorized staff read detention session items" on public.detention_session_items
for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or exists (
    select 1 from public.detention_sessions ds
    where ds.id = detention_session_id
      and (
        app_private.has_school_duty(ds.school_id,'detention_supervisor',ds.session_date)
        or exists (
          select 1 from public.staff_members sm
          where sm.id = ds.supervisor_staff_member_id
            and sm.user_id = (select auth.uid())
            and sm.status = 'active'
        )
      )
  )
);

create or replace function public.populate_detention_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_operate_detention_session(v_session.id) then raise exception 'Permission denied'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Session cannot be populated in its current state'; end if;

  insert into public.detention_session_items(tenant_id,school_id,detention_session_id,obligation_id,learner_id)
  select o.tenant_id,o.school_id,v_session.id,o.id,o.learner_id
  from public.late_detention_obligations o
  where o.school_id=v_session.school_id
    and o.status in ('pending','carried_forward')
    and o.due_on <= v_session.session_date
  on conflict(detention_session_id,obligation_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.record_detention_attendance(
  p_session_id uuid,
  p_obligation_id uuid,
  p_attendance_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_item public.detention_session_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_attendance_status not in ('attended','absent','excused') then raise exception 'Invalid detention attendance status'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_operate_detention_session(v_session.id) then raise exception 'Permission denied'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Session is not open for attendance'; end if;

  update public.detention_session_items
  set attendance_status=p_attendance_status,
      outcome_note=nullif(btrim(p_note),''),
      recorded_by_user_id=auth.uid(),recorded_at=now()
  where detention_session_id=p_session_id and obligation_id=p_obligation_id
  returning * into v_item;
  if not found then raise exception 'Detention session item not found'; end if;

  if p_attendance_status='attended' then
    update public.late_detention_obligations
      set status='completed',completed_at=now(),completed_by_user_id=auth.uid(),resolution_note=coalesce(nullif(btrim(p_note),''),resolution_note),updated_at=now()
    where id=p_obligation_id and status in ('pending','carried_forward');
  end if;
  return true;
end;
$$;

create or replace function public.complete_detention_session(p_session_id uuid,p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_unrecorded integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_operate_detention_session(v_session.id) then raise exception 'Permission denied'; end if;
  select count(*) into v_unrecorded from public.detention_session_items where detention_session_id=p_session_id and attendance_status='scheduled';
  if v_unrecorded>0 then raise exception 'All scheduled learners must have a detention attendance outcome'; end if;
  update public.detention_sessions
  set status='completed',completed_by_user_id=auth.uid(),completed_at=now(),notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now()
  where id=p_session_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_session.tenant_id,v_session.school_id,auth.uid(),'detention.session.completed','detention_session',v_session.id,jsonb_build_object('session_date',v_session.session_date));
  return true;
end;
$$;
