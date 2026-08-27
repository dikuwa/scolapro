alter table public.user_profiles
  add column if not exists avatar_path text,
  add column if not exists must_change_password boolean not null default false;

drop policy if exists "users can create own profile" on public.user_profiles;
create policy "users can create own profile"
on public.user_profiles for insert
to authenticated
with check (user_id = auth.uid());

insert into public.user_profiles (user_id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can upload own avatar" on storage.objects;
create policy "users can upload own avatar"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can update own avatar" on storage.objects;
create policy "users can update own avatar"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can delete own avatar" on storage.objects;
create policy "users can delete own avatar"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info','success','warning','danger')),
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
on public.notifications (recipient_user_id, created_at desc)
where dismissed_at is null;

alter table public.notifications enable row level security;

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
to authenticated
using (recipient_user_id = auth.uid());

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists "users can delete own notifications" on public.notifications;
create policy "users can delete own notifications"
on public.notifications for delete
to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare affected integer;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = auth.uid()
    and dismissed_at is null
    and read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.dismiss_all_notifications()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare affected integer;
begin
  update public.notifications
  set dismissed_at = now(), read_at = coalesce(read_at, now())
  where recipient_user_id = auth.uid()
    and dismissed_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.dismiss_all_notifications() to authenticated;

comment on table public.notifications is 'User-scoped persistent notification inbox. Sonner remains for transient local feedback; this table is for durable actionable information.';
comment on column public.user_profiles.must_change_password is 'When true, the authenticated UI should prompt the user to choose a new password before normal first-login use.';
