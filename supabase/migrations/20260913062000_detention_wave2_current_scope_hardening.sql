-- Wave 2 detention operations are school-operational. Preserve the existing
-- late-arrival/detention lifecycle and provenance, but bind live RPC access to the
-- deterministic current school, effective placement/duty, and Platform Support denial.

create or replace function app_private.detention_current_school_is(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from (
      select sm.school_id
      from public.school_memberships sm
      where sm.user_id = p_user_id
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
      order by sm.active_from desc, sm.id asc
      limit 1
    ) current_school
    where current_school.school_id = p_school_id
  );
$$;

revoke all on function app_private.detention_current_school_is(uuid,uuid)
from public, anon, authenticated;

create or replace function app_private.can_manage_current_detention_school(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and (
      app_private.has_platform_role(array['platform_admin'])
      or (
        not app_private.has_platform_role(array['platform_support'])
        and app_private.detention_current_school_is((select auth.uid()), p_school_id)
        and exists (
          select 1
          from public.school_memberships sm
          where sm.user_id = (select auth.uid())
            and sm.school_id = p_school_id
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and (
              sm.staff_member_id is null
              or app_private.staff_member_has_school_assignment(
                sm.staff_member_id,
                p_school_id,
                current_date
              )
            )
        )
      )
    );
$$;

revoke all on function app_private.can_manage_current_detention_school(uuid)
from public, anon;
grant execute on function app_private.can_manage_current_detention_school(uuid)
to authenticated;

create or replace function app_private.can_coordinate_current_detention_school(
  p_school_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_manage_current_detention_school(p_school_id)
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.detention_current_school_is((select auth.uid()), p_school_id)
      and exists (
        select 1
        from public.school_duty_assignments d
        join public.staff_members staff
          on staff.id = d.staff_member_id
         and staff.user_id = (select auth.uid())
         and staff.status = 'active'
        where d.school_id = p_school_id
          and d.duty_key = 'late_arrival_recorder'
          and d.active_from <= p_on_date
          and (d.active_to is null or d.active_to >= p_on_date)
          and app_private.staff_member_has_school_assignment(
            staff.id,
            p_school_id,
            p_on_date
          )
      )
    );
$$;

revoke all on function app_private.can_coordinate_current_detention_school(uuid,date)
from public, anon;
grant execute on function app_private.can_coordinate_current_detention_school(uuid,date)
to authenticated;

create or replace function app_private.can_supervise_current_detention_session(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and not app_private.has_platform_role(array['platform_support'])
    and exists (
      select 1
      from public.detention_sessions ds
      where ds.id = p_session_id
        and app_private.detention_current_school_is((select auth.uid()), ds.school_id)
        and (
          exists (
            select 1
            from public.staff_members staff
            where staff.id = ds.supervisor_staff_member_id
              and staff.user_id = (select auth.uid())
              and staff.status = 'active'
              and app_private.staff_member_has_school_assignment(
                staff.id, ds.school_id, ds.session_date
              )
          )
          or exists (
            select 1
            from public.detention_session_supervisors team
            join public.staff_members staff
              on staff.id = team.staff_member_id
             and staff.user_id = (select auth.uid())
             and staff.status = 'active'
            where team.detention_session_id = ds.id
              and app_private.staff_member_has_school_assignment(
                staff.id, ds.school_id, ds.session_date
              )
          )
        )
    );
$$;

revoke all on function app_private.can_supervise_current_detention_session(uuid)
from public, anon;
grant execute on function app_private.can_supervise_current_detention_session(uuid)
to authenticated;

-- Current-school read wrappers for direct table access. Existing role/duty semantics
-- remain unchanged inside the current school.
create or replace function app_private.can_read_current_detention_school(
  p_school_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.detention_current_school_is((select auth.uid()), p_school_id)
      and (
        app_private.can_view_operational_learners(p_school_id)
        or app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_on_date)
      )
    );
$$;

revoke all on function app_private.can_read_current_detention_school(uuid,date)
from public, anon;
grant execute on function app_private.can_read_current_detention_school(uuid,date)
to authenticated;

-- Harden live RLS reads while keeping My Detention's dedicated self-scoped RPC.
drop policy if exists "authorized staff can read school late events" on public.school_late_arrival_events;
create policy "authorized staff can read school late events"
on public.school_late_arrival_events for select to authenticated
using (app_private.can_read_current_detention_school(school_id, arrival_date));

drop policy if exists "late duty can read detention obligations" on public.late_detention_obligations;
create policy "late duty can read detention obligations"
on public.late_detention_obligations for select to authenticated
using (app_private.can_read_current_detention_school(school_id, current_date));

drop policy if exists "authorized staff read detention sessions" on public.detention_sessions;
create policy "authorized staff read detention sessions"
on public.detention_sessions for select to authenticated
using (
  app_private.can_read_current_detention_school(school_id, session_date)
  or app_private.can_supervise_current_detention_session(id)
);

drop policy if exists "authorized staff read detention session items" on public.detention_session_items;
create policy "authorized staff read detention session items"
on public.detention_session_items for select to authenticated
using (
  app_private.can_read_current_detention_school(school_id, current_date)
  or app_private.can_supervise_current_detention_session(detention_session_id)
);

drop policy if exists "authorized staff read detention session duty teams" on public.detention_session_supervisors;
create policy "authorized staff read detention session duty teams"
on public.detention_session_supervisors for select to authenticated
using (
  app_private.can_read_current_detention_school(school_id, current_date)
  or app_private.can_supervise_current_detention_session(detention_session_id)
);

-- Preserve the existing implementations behind owner-only aliases. The public wrappers
-- add only current-scope authorization before delegating to the already-tested lifecycle.
alter function public.record_school_late_arrival(uuid,date,time without time zone,text)
  rename to record_school_late_arrival_wave2_unscoped;
revoke all on function public.record_school_late_arrival_wave2_unscoped(uuid,date,time without time zone,text)
  from public, anon, authenticated;

create function public.record_school_late_arrival(
  p_enrolment_id uuid,
  p_arrival_date date default current_date,
  p_arrived_at time without time zone default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  select e.school_id into v_school_id from public.enrolments e where e.id = p_enrolment_id;
  if v_school_id is null then raise exception 'Active learner enrolment not found for arrival date'; end if;
  if not app_private.can_coordinate_current_detention_school(v_school_id, p_arrival_date) then
    raise exception 'Permission denied';
  end if;
  return public.record_school_late_arrival_wave2_unscoped(
    p_enrolment_id,p_arrival_date,p_arrived_at,p_note
  );
end;
$$;
revoke all on function public.record_school_late_arrival(uuid,date,time without time zone,text) from public,anon;
grant execute on function public.record_school_late_arrival(uuid,date,time without time zone,text) to authenticated;

alter function public.roll_forward_late_detentions(uuid,date)
  rename to roll_forward_late_detentions_wave2_unscoped;
revoke all on function public.roll_forward_late_detentions_wave2_unscoped(uuid,date)
  from public, anon, authenticated;
create function public.roll_forward_late_detentions(
  p_school_id uuid,
  p_reference_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.can_coordinate_current_detention_school(p_school_id,p_reference_date) then
    raise exception 'Permission denied';
  end if;
  return public.roll_forward_late_detentions_wave2_unscoped(p_school_id,p_reference_date);
end;
$$;
revoke all on function public.roll_forward_late_detentions(uuid,date) from public,anon;
grant execute on function public.roll_forward_late_detentions(uuid,date) to authenticated;

alter function public.resolve_late_detention(uuid,text,text)
  rename to resolve_late_detention_wave2_unscoped;
revoke all on function public.resolve_late_detention_wave2_unscoped(uuid,text,text)
  from public, anon, authenticated;
create function public.resolve_late_detention(
  p_obligation_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_supervisor_allowed boolean := false;
begin
  select * into v_item from public.late_detention_obligations where id=p_obligation_id;
  if not found then raise exception 'Detention obligation not found'; end if;

  if p_status='completed'
     and not app_private.has_platform_role(array['platform_support'])
     and app_private.detention_current_school_is((select auth.uid()),v_item.school_id) then
    v_supervisor_allowed := app_private.is_assigned_late_detention_supervisor(p_obligation_id);
  end if;

  if not app_private.can_coordinate_current_detention_school(v_item.school_id,current_date)
     and not v_supervisor_allowed then
    raise exception 'Permission denied';
  end if;

  return public.resolve_late_detention_wave2_unscoped(p_obligation_id,p_status,p_note);
end;
$$;
revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon;
grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;

alter function public.undo_latest_school_late_arrival(uuid,text)
  rename to undo_latest_school_late_arrival_wave2_unscoped;
revoke all on function public.undo_latest_school_late_arrival_wave2_unscoped(uuid,text)
  from public, anon, authenticated;
create function public.undo_latest_school_late_arrival(
  p_enrolment_id uuid,
  p_reason text default 'Incorrect late-arrival entry'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  select e.school_id into v_school_id from public.enrolments e where e.id=p_enrolment_id;
  if v_school_id is null or not app_private.can_manage_current_detention_school(v_school_id) then
    raise exception 'Only current-school leadership can undo a late-arrival entry';
  end if;
  return public.undo_latest_school_late_arrival_wave2_unscoped(p_enrolment_id,p_reason);
end;
$$;
revoke all on function public.undo_latest_school_late_arrival(uuid,text) from public,anon;
grant execute on function public.undo_latest_school_late_arrival(uuid,text) to authenticated;

alter function public.set_detention_supervision_eligibility(uuid,uuid,boolean)
  rename to set_detention_supervision_eligibility_wave2_unscoped;
revoke all on function public.set_detention_supervision_eligibility_wave2_unscoped(uuid,uuid,boolean)
  from public, anon, authenticated;
create function public.set_detention_supervision_eligibility(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_eligible boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.can_manage_current_detention_school(p_school_id) then raise exception 'Permission denied'; end if;
  return public.set_detention_supervision_eligibility_wave2_unscoped(p_school_id,p_staff_member_id,p_eligible);
end;
$$;
revoke all on function public.set_detention_supervision_eligibility(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_detention_supervision_eligibility(uuid,uuid,boolean) to authenticated;

alter function public.reassign_late_detention_supervisor(uuid,uuid)
  rename to reassign_late_detention_supervisor_wave2_unscoped;
revoke all on function public.reassign_late_detention_supervisor_wave2_unscoped(uuid,uuid)
  from public, anon, authenticated;
create function public.reassign_late_detention_supervisor(
  p_obligation_id uuid,
  p_staff_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  select o.school_id into v_school_id from public.late_detention_obligations o where o.id=p_obligation_id;
  if v_school_id is null or not app_private.can_manage_current_detention_school(v_school_id) then raise exception 'Permission denied'; end if;
  return public.reassign_late_detention_supervisor_wave2_unscoped(p_obligation_id,p_staff_member_id);
end;
$$;
revoke all on function public.reassign_late_detention_supervisor(uuid,uuid) from public,anon;
grant execute on function public.reassign_late_detention_supervisor(uuid,uuid) to authenticated;

alter function public.create_detention_session(uuid,date,time without time zone,time without time zone,uuid,text,text)
  rename to create_detention_session_wave2_unscoped;
revoke all on function public.create_detention_session_wave2_unscoped(uuid,date,time without time zone,time without time zone,uuid,text,text)
  from public, anon, authenticated;
create function public.create_detention_session(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time without time zone default null,
  p_ends_at time without time zone default null,
  p_supervisor_staff_member_id uuid default null,
  p_location text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.can_manage_current_detention_school(p_school_id) then raise exception 'Permission denied'; end if;
  return public.create_detention_session_wave2_unscoped(
    p_school_id,p_session_date,p_starts_at,p_ends_at,p_supervisor_staff_member_id,p_location,p_notes
  );
end;
$$;
revoke all on function public.create_detention_session(uuid,date,time without time zone,time without time zone,uuid,text,text) from public,anon;
grant execute on function public.create_detention_session(uuid,date,time without time zone,time without time zone,uuid,text,text) to authenticated;

alter function public.populate_detention_session(uuid)
  rename to populate_detention_session_wave2_unscoped;
revoke all on function public.populate_detention_session_wave2_unscoped(uuid)
  from public, anon, authenticated;
create function public.populate_detention_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
begin
  select * into v_session from public.detention_sessions where id=p_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date) then raise exception 'Permission denied'; end if;
  return public.populate_detention_session_wave2_unscoped(p_session_id);
end;
$$;
revoke all on function public.populate_detention_session(uuid) from public,anon;
grant execute on function public.populate_detention_session(uuid) to authenticated;

alter function public.create_detention_session_plan(uuid,date,time without time zone,time without time zone,text,text,uuid[])
  rename to create_detention_session_plan_wave2_unscoped;
revoke all on function public.create_detention_session_plan_wave2_unscoped(uuid,date,time without time zone,time without time zone,text,text,uuid[])
  from public, anon, authenticated;
create function public.create_detention_session_plan(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time without time zone default null,
  p_ends_at time without time zone default null,
  p_location text default null,
  p_notes text default null,
  p_staff_member_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.can_coordinate_current_detention_school(p_school_id,p_session_date) then raise exception 'Permission denied'; end if;
  return public.create_detention_session_plan_wave2_unscoped(
    p_school_id,p_session_date,p_starts_at,p_ends_at,p_location,p_notes,p_staff_member_ids
  );
end;
$$;
revoke all on function public.create_detention_session_plan(uuid,date,time without time zone,time without time zone,text,text,uuid[]) from public,anon;
grant execute on function public.create_detention_session_plan(uuid,date,time without time zone,time without time zone,text,text,uuid[]) to authenticated;

alter function public.list_detention_planning_staff(uuid,date,date)
  rename to list_detention_planning_staff_wave2_unscoped;
revoke all on function public.list_detention_planning_staff_wave2_unscoped(uuid,date,date)
  from public, anon, authenticated;
create function public.list_detention_planning_staff(
  p_school_id uuid,
  p_from_date date,
  p_to_date date
)
returns table(
  staff_member_id uuid,
  employee_number text,
  first_name text,
  last_name text,
  eligible boolean,
  effective_from date,
  effective_to date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.can_coordinate_current_detention_school(p_school_id,p_from_date) then raise exception 'Permission denied'; end if;
  return query select * from public.list_detention_planning_staff_wave2_unscoped(p_school_id,p_from_date,p_to_date);
end;
$$;
revoke all on function public.list_detention_planning_staff(uuid,date,date) from public,anon;
grant execute on function public.list_detention_planning_staff(uuid,date,date) to authenticated;

alter function public.set_detention_session_supervisors(uuid,uuid[])
  rename to set_detention_session_supervisors_wave2_unscoped;
revoke all on function public.set_detention_session_supervisors_wave2_unscoped(uuid,uuid[])
  from public, anon, authenticated;
create function public.set_detention_session_supervisors(
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
begin
  select * into v_session from public.detention_sessions where id=p_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date) then raise exception 'Permission denied'; end if;
  return public.set_detention_session_supervisors_wave2_unscoped(p_session_id,p_staff_member_ids);
end;
$$;
revoke all on function public.set_detention_session_supervisors(uuid,uuid[]) from public,anon;
grant execute on function public.set_detention_session_supervisors(uuid,uuid[]) to authenticated;

alter function public.assign_detention_session_learners(uuid,uuid[],uuid)
  rename to assign_detention_session_learners_wave2_unscoped;
revoke all on function public.assign_detention_session_learners_wave2_unscoped(uuid,uuid[],uuid)
  from public, anon, authenticated;
create function public.assign_detention_session_learners(
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
begin
  select * into v_session from public.detention_sessions where id=p_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date) then raise exception 'Permission denied'; end if;
  return public.assign_detention_session_learners_wave2_unscoped(p_session_id,p_obligation_ids,p_supervisor_staff_member_id);
end;
$$;
revoke all on function public.assign_detention_session_learners(uuid,uuid[],uuid) from public,anon;
grant execute on function public.assign_detention_session_learners(uuid,uuid[],uuid) to authenticated;

alter function public.record_detention_attendance(uuid,uuid,text,text)
  rename to record_detention_attendance_wave2_unscoped;
revoke all on function public.record_detention_attendance_wave2_unscoped(uuid,uuid,text,text)
  from public, anon, authenticated;
create function public.record_detention_attendance(
  p_session_id uuid,
  p_obligation_id uuid,
  p_attendance_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
begin
  select * into v_session from public.detention_sessions where id=p_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date)
     and not app_private.can_supervise_current_detention_session(v_session.id) then
    raise exception 'Permission denied';
  end if;
  return public.record_detention_attendance_wave2_unscoped(
    p_session_id,p_obligation_id,p_attendance_status,p_note
  );
end;
$$;
revoke all on function public.record_detention_attendance(uuid,uuid,text,text) from public,anon;
grant execute on function public.record_detention_attendance(uuid,uuid,text,text) to authenticated;

alter function public.complete_detention_session(uuid,text)
  rename to complete_detention_session_wave2_unscoped;
revoke all on function public.complete_detention_session_wave2_unscoped(uuid,text)
  from public, anon, authenticated;
create function public.complete_detention_session(
  p_session_id uuid,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
begin
  select * into v_session from public.detention_sessions where id=p_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  if not app_private.can_coordinate_current_detention_school(v_session.school_id,v_session.session_date)
     and not app_private.can_supervise_current_detention_session(v_session.id) then
    raise exception 'Permission denied';
  end if;
  return public.complete_detention_session_wave2_unscoped(p_session_id,p_notes);
end;
$$;
revoke all on function public.complete_detention_session(uuid,text) from public,anon;
grant execute on function public.complete_detention_session(uuid,text) to authenticated;

comment on function app_private.can_coordinate_current_detention_school(uuid,date) is
'Live Wave 2 detention coordinator boundary: Platform Admin or deterministic-current-school leadership/delegated late-arrival duty with effective placement; Platform Support is excluded from school-operational authority.';
comment on function app_private.can_supervise_current_detention_session(uuid) is
'Live detention supervisor boundary requiring deterministic current school, effective session-date placement and explicit Platform Support denial.';
