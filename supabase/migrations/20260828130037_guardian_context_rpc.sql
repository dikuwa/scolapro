-- Resolve guardian context through a narrow authenticated RPC so global app context
-- does not depend on direct RLS reads from guardian_user_links.

create or replace function public.get_my_guardian_links()
returns table (
  link_id uuid,
  tenant_id uuid,
  guardian_id uuid
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select gul.id, gul.tenant_id, gul.guardian_id
  from public.guardian_user_links gul
  where gul.user_id = auth.uid();
$$;

revoke all on function public.get_my_guardian_links() from public, anon;
grant execute on function public.get_my_guardian_links() to authenticated;

comment on function public.get_my_guardian_links() is 'Returns guardian identities linked to the currently authenticated account without exposing arbitrary guardian links.';
