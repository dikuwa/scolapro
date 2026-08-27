create or replace function public.get_school_invitation_preview(p_token text)
returns table(
  invitation_id uuid,
  email text,
  first_name text,
  last_name text,
  role_key text,
  school_name text,
  tenant_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    si.id,
    si.email,
    si.first_name,
    si.last_name,
    si.role_key,
    s.name,
    t.name,
    si.expires_at
  from public.school_invitations si
  join public.schools s on s.id = si.school_id
  join public.tenants t on t.id = si.tenant_id
  where si.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and si.status = 'pending'
    and si.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_school_invitation_preview(text) from public;
grant execute on function public.get_school_invitation_preview(text) to anon, authenticated;

comment on function public.get_school_invitation_preview(text) is
  'Returns only the invitation details required to render the possession-based join screen. The raw token is never stored.';
