-- Complete mandatory password rotation only after the trusted server has
-- successfully changed the Supabase Auth password. The database clearance and
-- non-secret audit event are one transaction.
create or replace function public.complete_password_rotation_clearance(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cleared_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Password rotation completion requires service authority'
      using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'Missing password rotation user' using errcode='22023';
  end if;

  update public.user_profiles
  set must_change_password=false,
      password_rotation_expires_at=null,
      updated_at=now()
  where user_id=p_user_id
    and must_change_password is distinct from false
  returning user_id into v_cleared_user_id;

  if v_cleared_user_id is null then
    return false;
  end if;

  insert into public.audit_events (
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_user_id,
    'auth.password_rotation_completed',
    'user_profile',
    p_user_id,
    jsonb_build_object(
      'credential_material_recorded', false,
      'managed_temporary_credential_cleared', true
    )
  );

  return true;
end;
$$;

revoke all on function public.complete_password_rotation_clearance(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_password_rotation_clearance(uuid)
  to service_role;
