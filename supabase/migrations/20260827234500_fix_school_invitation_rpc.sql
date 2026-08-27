-- Fix output-column name shadowing inside create_school_invitation().
-- The RETURNS TABLE output column `expires_at` is a PL/pgSQL variable, so
-- unqualified references to the table column are ambiguous.

create or replace function public.create_school_invitation(
  p_school_id uuid,
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_employee_number text default null,
  p_role_key text default 'school_admin'
)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_school public.schools%rowtype;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
    and status = 'active';

  if not found then
    raise exception 'School not found or inactive';
  end if;

  if not app_private.can_manage_school_members(p_school_id) then
    raise exception 'Permission denied';
  end if;

  if p_role_key not in (
    'school_admin','principal','deputy_principal','hod','teacher','class_teacher',
    'counsellor','librarian','board_member'
  ) then
    raise exception 'Unsupported school role';
  end if;

  if btrim(coalesce(p_email, '')) = '' then
    raise exception 'Email is required';
  end if;

  update public.school_invitations as si
  set status = 'expired'
  where si.school_id = p_school_id
    and lower(btrim(si.email)) = lower(btrim(p_email))
    and si.role_key = p_role_key
    and si.status = 'pending'
    and si.expires_at <= now();

  if exists (
    select 1
    from public.school_invitations as si
    where si.school_id = p_school_id
      and lower(btrim(si.email)) = lower(btrim(p_email))
      and si.role_key = p_role_key
      and si.status = 'pending'
      and si.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email and role';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.school_invitations (
    tenant_id, school_id, email, first_name, last_name, employee_number,
    role_key, token_hash, invited_by_user_id, expires_at
  )
  values (
    v_school.tenant_id,
    p_school_id,
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_first_name, '')), ''),
    nullif(btrim(coalesce(p_last_name, '')), ''),
    nullif(btrim(coalesce(p_employee_number, '')), ''),
    p_role_key,
    encode(digest(v_token, 'sha256'), 'hex'),
    auth.uid(),
    v_expires_at
  )
  returning id into v_invitation_id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values (
    v_school.tenant_id,
    p_school_id,
    auth.uid(),
    'school_invitation.created',
    'school_invitation',
    v_invitation_id,
    jsonb_build_object('email', lower(btrim(p_email)), 'role_key', p_role_key)
  );

  return query select v_invitation_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_school_invitation(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.create_school_invitation(uuid,text,text,text,text,text) to authenticated;
