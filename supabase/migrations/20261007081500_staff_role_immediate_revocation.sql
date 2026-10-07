-- Issue #1145: make staff access revocation authoritative on the day it is requested.
-- school_memberships.active_to remains an inclusive "last active day". The staff revoke
-- workflow therefore defaults to yesterday so current-day authorization stops immediately.
-- A membership granted and revoked on the same day is retained as an empty effective
-- interval (active_to = active_from - 1) so history and audit provenance are preserved.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.school_memberships'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%active_to%'
      and pg_get_constraintdef(oid) ilike '%active_from%'
  loop
    execute format('alter table public.school_memberships drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.school_memberships
  add constraint school_memberships_effective_range_check
  check (active_to is null or active_to >= (active_from - 1));

create or replace function public.end_staff_school_role(
  p_school_id uuid,
  p_membership_id uuid,
  p_effective_to date default (current_date - 1)
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_membership public.school_memberships%rowtype;
begin
  if auth.uid() is null
     or not app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  select *
  into v_membership
  from public.school_memberships
  where id=p_membership_id
    and school_id=p_school_id
  for update;

  if not found then
    raise exception 'School role not found';
  end if;

  if p_effective_to is null
     or p_effective_to < (v_membership.active_from - 1) then
    raise exception 'Role end date is invalid';
  end if;

  if v_membership.active_to is not null
     and p_effective_to > v_membership.active_to then
    raise exception 'Cannot extend a closed school role';
  end if;

  update public.school_memberships
  set active_to=p_effective_to
  where id=p_membership_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_membership.tenant_id,
    p_school_id,
    auth.uid(),
    'school_membership.role_ended',
    'school_membership',
    p_membership_id,
    jsonb_build_object(
      'staff_member_id',v_membership.staff_member_id,
      'role_key',v_membership.role_key,
      'effective_to',p_effective_to,
      'revoked_on',current_date
    )
  );

  return true;
end;
$$;

revoke all on function public.end_staff_school_role(uuid,uuid,date) from public,anon;
grant execute on function public.end_staff_school_role(uuid,uuid,date) to authenticated;

comment on function public.end_staff_school_role(uuid,uuid,date) is
'Ends a staff school role without deleting history. Omitted p_effective_to revokes immediately by storing yesterday as the inclusive last active day; a same-day grant/revoke is retained as an empty effective interval.';
