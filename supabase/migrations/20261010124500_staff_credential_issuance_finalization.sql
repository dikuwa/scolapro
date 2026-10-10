-- Service-only lifecycle transition for a previously reserved credential attempt.
-- Auth mutation is performed only by the trusted server issuance flow.
-- This function never receives or exposes the plaintext password.
create or replace function public.finalize_staff_credential_issuance(
  p_attempt_id uuid,
  p_outcome text,
  p_credential_fingerprint text,
  p_credential_expires_at timestamptz
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Credential issuance finalization requires service authority' using errcode='42501';
  end if;
  if p_outcome not in ('completed','failed','cancelled') or p_attempt_id is null then
    raise exception 'Invalid issuance finalization' using errcode='22023';
  end if;

  if p_outcome='completed' then
    if p_credential_fingerprint is null
       or p_credential_fingerprint !~ '^[a-f0-9]{64}$'
       or p_credential_expires_at is null
       or p_credential_expires_at <= now()
       or p_credential_expires_at > now() + interval '2 hours' then
      raise exception 'Completed credential issuance requires bounded non-secret metadata' using errcode='22023';
    end if;
  elsif p_credential_fingerprint is not null or p_credential_expires_at is not null then
    raise exception 'Unsuccessful attempts must not retain credential metadata' using errcode='22023';
  end if;

  update public.staff_credential_issuance_attempts
  set outcome=p_outcome,
      credential_fingerprint=p_credential_fingerprint,
      credential_expires_at=p_credential_expires_at,
      finalized_at=now()
  where id=p_attempt_id
    and outcome='reserved'
    and attempted_at>now()-interval '15 minutes'
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.finalize_staff_credential_issuance(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_staff_credential_issuance(uuid,text,text,timestamptz)
  to service_role;
