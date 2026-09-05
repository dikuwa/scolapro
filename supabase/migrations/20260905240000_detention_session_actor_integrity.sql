-- Detention session planning/completion and duty-team assignment carry durable human
-- provenance. Authenticated actor identity is checked immediately. Trusted/bootstrap
-- session creators are date-aware authority-validated at transaction commit so related
-- staffing/duty rows can be established atomically without statement-order coupling.

create or replace function app_private.user_can_coordinate_detention_session(
  p_user_id uuid,
  p_school_id uuid,
  p_session_date date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_user_id is not null and (
    exists(
      select 1 from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.school_duty_assignments d
      join public.staff_members staff
        on staff.id=d.staff_member_id
       and staff.user_id=p_user_id
       and staff.status='active'
      where d.school_id=p_school_id
        and d.duty_key='late_arrival_recorder'
        and d.active_from<=p_session_date
        and (d.active_to is null or d.active_to>=p_session_date)
        and app_private.staff_member_has_school_assignment(staff.id,p_school_id,p_session_date)
    )
  );
$$;
revoke all on function app_private.user_can_coordinate_detention_session(uuid,uuid,date) from public,anon,authenticated;

create or replace function app_private.user_can_complete_detention_session_actor(p_user_id uuid,p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.detention_sessions ds
    where ds.id=p_session_id
      and (
        app_private.user_can_coordinate_detention_session(p_user_id,ds.school_id,ds.session_date)
        or exists(
          select 1 from public.staff_members staff
          where staff.id=ds.supervisor_staff_member_id
            and staff.user_id=p_user_id
            and staff.status='active'
            and app_private.staff_member_has_school_assignment(staff.id,ds.school_id,ds.session_date)
        )
        or exists(
          select 1
          from public.detention_session_supervisors team
          join public.staff_members staff on staff.id=team.staff_member_id
          where team.detention_session_id=ds.id
            and staff.user_id=p_user_id
            and staff.status='active'
            and app_private.staff_member_has_school_assignment(staff.id,ds.school_id,ds.session_date)
        )
      )
  );
$$;
revoke all on function app_private.user_can_complete_detention_session_actor(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.enforce_detention_session_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='INSERT' then
    if new.created_by_user_id is null then raise exception 'Detention session creator is required'; end if;
    if auth.uid() is not null and new.created_by_user_id<>auth.uid() then
      raise exception 'Detention session creator must match authenticated actor';
    end if;
    if new.completed_by_user_id is not null or new.completed_at is not null or new.status='completed' then
      raise exception 'Detention session cannot be created as completed';
    end if;
    return new;
  end if;

  if new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Detention session creator provenance is immutable';
  end if;

  if old.status='completed' then
    if new.status is distinct from old.status
       or new.completed_by_user_id is distinct from old.completed_by_user_id
       or new.completed_at is distinct from old.completed_at then
      raise exception 'Detention session completion provenance is immutable';
    end if;
    return new;
  end if;

  if new.status='completed' and old.status<>'completed' then
    if new.completed_by_user_id is null or new.completed_at is null then
      raise exception 'Detention session completion requires actor and timestamp';
    end if;
    if auth.uid() is not null and new.completed_by_user_id<>auth.uid() then
      raise exception 'Detention session completer must match authenticated actor';
    end if;
    if not app_private.user_can_complete_detention_session_actor(new.completed_by_user_id,old.id) then
      raise exception 'Detention session completer is not authorized for session';
    end if;
  elsif new.completed_by_user_id is not null or new.completed_at is not null then
    raise exception 'Detention session completion provenance requires completed status';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_detention_session_actor_integrity() from public,anon,authenticated;

create or replace function app_private.enforce_detention_session_creator_commit_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if not app_private.user_can_coordinate_detention_session(new.created_by_user_id,new.school_id,new.session_date) then
    raise exception 'Detention session creator is not authorized for school and session date';
  end if;
  return null;
end;
$$;
revoke all on function app_private.enforce_detention_session_creator_commit_integrity() from public,anon,authenticated;

drop trigger if exists detention_session_submit_actor_integrity_trg on public.detention_sessions;
create trigger detention_session_submit_actor_integrity_trg
before insert or update of created_by_user_id,status,completed_by_user_id,completed_at,school_id,session_date
on public.detention_sessions
for each row execute function app_private.enforce_detention_session_actor_integrity();

drop trigger if exists detention_session_creator_commit_integrity_trg on public.detention_sessions;
create constraint trigger detention_session_creator_commit_integrity_trg
after insert or update of school_id,session_date,created_by_user_id
on public.detention_sessions
deferrable initially deferred
for each row execute function app_private.enforce_detention_session_creator_commit_integrity();

create or replace function app_private.enforce_detention_session_supervisor_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
begin
  if tg_op='UPDATE' and new.assigned_by_user_id is distinct from old.assigned_by_user_id then
    raise exception 'Detention supervisor assigner provenance is immutable';
  end if;
  if tg_op='INSERT' then
    select * into v_session from public.detention_sessions where id=new.detention_session_id;
    if not found then return new; end if;
    if auth.uid() is not null and new.assigned_by_user_id<>auth.uid() then
      raise exception 'Detention supervisor assigner must match authenticated actor';
    end if;
    if not app_private.user_can_coordinate_detention_session(new.assigned_by_user_id,v_session.school_id,v_session.session_date) then
      raise exception 'Detention supervisor assigner is not authorized for session';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_detention_session_supervisor_actor_integrity() from public,anon,authenticated;

drop trigger if exists detention_session_supervisor_submit_actor_integrity_trg on public.detention_session_supervisors;
create trigger detention_session_supervisor_submit_actor_integrity_trg
before insert or update of assigned_by_user_id,detention_session_id
on public.detention_session_supervisors
for each row execute function app_private.enforce_detention_session_supervisor_actor_integrity();
