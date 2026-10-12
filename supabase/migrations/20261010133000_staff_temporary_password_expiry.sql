-- Track the expiry of administrator-issued temporary credentials.
-- Null preserves legacy/ordinary password-rotation requirements that were not
-- created by the managed temporary-credential workflow.
alter table public.user_profiles
  add column if not exists password_rotation_expires_at timestamptz;

comment on column public.user_profiles.password_rotation_expires_at is
  'Expiry for a managed temporary credential. Null when no managed temporary credential is active.';

alter table public.user_profiles
  drop constraint if exists user_profiles_password_rotation_expiry_state_check;
alter table public.user_profiles
  add constraint user_profiles_password_rotation_expiry_state_check
  check (password_rotation_expires_at is null or must_change_password is distinct from false);

-- Extend the existing clearance guard: authenticated clients may neither clear
-- mandatory rotation nor move/remove a managed credential expiry. Only the
-- trusted service-role workflow may change those security fields.
create or replace function public.prevent_untrusted_password_rotation_clearance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if old.must_change_password is distinct from false
       and new.must_change_password is false then
      raise exception 'Password rotation clearance requires service authority'
        using errcode = '42501';
    end if;

    if new.password_rotation_expires_at is distinct from old.password_rotation_expires_at then
      raise exception 'Password rotation expiry changes require service authority'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_password_rotation_clearance_guard on public.user_profiles;
create trigger user_profiles_password_rotation_clearance_guard
before update of must_change_password, password_rotation_expires_at on public.user_profiles
for each row execute function public.prevent_untrusted_password_rotation_clearance();

revoke all on function public.prevent_untrusted_password_rotation_clearance()
  from public, anon, authenticated;
