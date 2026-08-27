create table if not exists public.platform_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null check (role_key in ('platform_admin','platform_support')),
  active_from date not null default current_date,
  active_to date,
  created_at timestamptz not null default now(),
  unique (user_id, role_key, active_from),
  check (active_to is null or active_to >= active_from)
);

alter table public.platform_memberships enable row level security;

create policy "users can read own platform membership"
on public.platform_memberships for select
to authenticated
using (user_id = auth.uid());

create or replace function app_private.has_platform_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_memberships pm
    where pm.user_id = auth.uid()
      and pm.role_key = any(allowed_roles)
      and pm.active_from <= current_date
      and (pm.active_to is null or pm.active_to >= current_date)
  );
$$;

grant execute on function app_private.has_platform_role(text[]) to authenticated;

create or replace function app_private.has_school_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin','platform_support'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

create or replace function app_private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin','platform_support'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.tenant_id = target_tenant_id
        and sm.user_id = auth.uid()
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;
