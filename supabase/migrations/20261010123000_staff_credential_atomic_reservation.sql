-- Internal, service-role-only atomic reservation for staff credential issuance.
-- This function does NOT create a password, modify Auth, or expose credentials.
create or replace function public.reserve_staff_credential_issuance(
  p_school_id uuid, p_staff_member_id uuid, p_actor_user_id uuid
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_target_user_id uuid;
  v_attempt_id uuid;
  v_school_date date := (now() at time zone 'Africa/Windhoek')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Credential issuance reservation requires service authority' using errcode='42501';
  end if;
  if p_school_id is null or p_staff_member_id is null or p_actor_user_id is null then
    raise exception 'Missing credential issuance scope' using errcode='22023';
  end if;

  -- Serialize per staff and actor to avoid concurrent limit bypass. The same
  -- actor issuing to different staff must also share one lock.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_staff_member_id::text, 1));

  select s.tenant_id, sm.user_id
    into v_tenant_id, v_target_user_id
  from public.schools s
  join public.staff_members sm
    on sm.tenant_id=s.tenant_id and sm.id=p_staff_member_id
  where s.id=p_school_id and s.status='active'
    and exists (
      select 1
      from public.staff_school_assignments a
      where a.school_id=s.id
        and a.staff_member_id=sm.id
        and a.effective_from<=v_school_date
        and (a.effective_to is null or a.effective_to>=v_school_date)
    );

  if v_tenant_id is null then
    raise exception 'Staff is not actively placed at this school' using errcode='42501';
  end if;
  if v_target_user_id is null then
    raise exception 'Staff account must be linked before credential issuance' using errcode='42501';
  end if;
  if v_target_user_id = p_actor_user_id then
    raise exception 'Administrators cannot issue temporary credentials to themselves' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.school_memberships m
    where m.school_id=p_school_id
      and m.user_id=p_actor_user_id
      and m.role_key='school_admin'
      and m.active_from<=v_school_date
      and (m.active_to is null or m.active_to>=v_school_date)
  ) then
    raise exception 'School administrator permission required' using errcode='42501';
  end if;

  -- The advisory lock above serializes concurrent reservation attempts. Refuse
  -- a second live reservation so two browser actions cannot race provider
  -- password updates and both return different "successful" credentials.
  if exists (
    select 1
    from public.staff_credential_issuance_attempts a
    where a.school_id=p_school_id
      and a.staff_member_id=p_staff_member_id
      and a.outcome='reserved'
      and a.attempted_at>now()-interval '15 minutes'
  ) then
    raise exception 'Credential issuance is already in progress for this staff account'
      using errcode='55000';
  end if;

  -- A school administrator may not use this workflow to take over another
  -- active school-administrator account. Protected admin recovery remains a
  -- separate Control Room/provider recovery path.
  if exists (
    select 1
    from public.school_memberships m
    where m.school_id=p_school_id
      and m.user_id=v_target_user_id
      and m.role_key='school_admin'
      and m.active_from<=v_school_date
      and (m.active_to is null or m.active_to>=v_school_date)
  ) then
    raise exception 'Protected administrator credentials cannot be issued here' using errcode='42501';
  end if;

  if (select count(*)
      from public.staff_credential_issuance_attempts a
      where a.school_id=p_school_id
        and a.staff_member_id=p_staff_member_id
        and a.attempted_at>now()-interval '24 hours')>=3
     or
     (select count(*)
      from public.staff_credential_issuance_attempts a
      where a.actor_user_id=p_actor_user_id
        and a.attempted_at>now()-interval '1 hour')>=10 then
    raise exception 'Credential issuance rate limit exceeded' using errcode='42900';
  end if;

  insert into public.staff_credential_issuance_attempts
    (tenant_id, school_id, staff_member_id, target_user_id, actor_user_id)
  values
    (v_tenant_id, p_school_id, p_staff_member_id, v_target_user_id, p_actor_user_id)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.reserve_staff_credential_issuance(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_staff_credential_issuance(uuid,uuid,uuid) to service_role;
