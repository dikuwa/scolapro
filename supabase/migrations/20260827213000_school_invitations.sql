create table if not exists public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  email text not null,
  first_name text,
  last_name text,
  employee_number text,
  role_key text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by_user_id uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  check (btrim(email) <> ''),
  check (accepted_at is null or accepted_at >= invited_at)
);

create index if not exists school_invitations_school_status_idx
  on public.school_invitations (school_id, status, expires_at desc);

create unique index if not exists school_invitations_one_pending_email_role_uidx
  on public.school_invitations (school_id, lower(btrim(email)), role_key)
  where status = 'pending';

alter table public.school_invitations enable row level security;

create or replace function app_private.can_manage_school_members(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app_private.is_platform_admin()
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role_key = 'school_admin'
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

grant execute on function app_private.can_manage_school_members(uuid) to authenticated;

create policy "authorized admins can read school invitations"
on public.school_invitations for select
to authenticated
using (app_private.can_manage_school_members(school_id));

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

  update public.school_invitations
  set status = 'expired'
  where school_id = p_school_id
    and lower(btrim(email)) = lower(btrim(p_email))
    and role_key = p_role_key
    and status = 'pending'
    and expires_at <= now();

  if exists (
    select 1
    from public.school_invitations
    where school_id = p_school_id
      and lower(btrim(email)) = lower(btrim(p_email))
      and role_key = p_role_key
      and status = 'pending'
      and expires_at > now()
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

create or replace function public.accept_school_invitation(p_token text)
returns table(school_id uuid, role_key text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_user_email text;
  v_staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_user_email = '' then
    raise exception 'Authenticated account has no email';
  end if;

  select * into v_invite
  from public.school_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invitation is invalid or no longer available';
  end if;

  if v_invite.expires_at <= now() then
    update public.school_invitations set status = 'expired' where id = v_invite.id;
    raise exception 'Invitation has expired';
  end if;

  if lower(btrim(v_invite.email)) <> v_user_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  select id into v_staff_id
  from public.staff_members
  where tenant_id = v_invite.tenant_id
    and user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_staff_id is null then
    insert into public.staff_members (
      tenant_id, user_id, employee_number, first_name, last_name, status
    )
    values (
      v_invite.tenant_id,
      auth.uid(),
      v_invite.employee_number,
      coalesce(v_invite.first_name, split_part(v_invite.email, '@', 1)),
      coalesce(v_invite.last_name, ''),
      'active'
    )
    returning id into v_staff_id;
  end if;

  insert into public.user_profiles (user_id, display_name)
  values (
    auth.uid(),
    nullif(btrim(concat_ws(' ', v_invite.first_name, v_invite.last_name)), '')
  )
  on conflict (user_id) do update
  set display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
      updated_at = now();

  insert into public.school_memberships (
    tenant_id, school_id, user_id, staff_member_id, role_key, active_from
  )
  values (
    v_invite.tenant_id,
    v_invite.school_id,
    auth.uid(),
    v_staff_id,
    v_invite.role_key,
    current_date
  )
  on conflict do nothing;

  update public.school_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values (
    v_invite.tenant_id,
    v_invite.school_id,
    auth.uid(),
    'school_invitation.accepted',
    'school_invitation',
    v_invite.id,
    jsonb_build_object('role_key', v_invite.role_key)
  );

  return query select v_invite.school_id, v_invite.role_key;
end;
$$;

revoke all on function public.create_school_invitation(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.create_school_invitation(uuid,text,text,text,text,text) to authenticated;

revoke all on function public.accept_school_invitation(text) from public, anon;
grant execute on function public.accept_school_invitation(text) to authenticated;

comment on table public.school_invitations is 'Governed, time-limited invitation records for school-scoped roles. Raw invitation tokens are never stored.';
