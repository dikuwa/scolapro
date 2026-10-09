-- Keep password-rotation clearance under server-only authority.
-- A client may not bypass first-login rotation by updating user_profiles directly.
create or replace function public.prevent_untrusted_password_rotation_clearance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.must_change_password is true
     and new.must_change_password is distinct from old.must_change_password
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Password rotation clearance requires service authority'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_password_rotation_clearance_guard on public.user_profiles;
create trigger user_profiles_password_rotation_clearance_guard
before update of must_change_password on public.user_profiles
for each row execute function public.prevent_untrusted_password_rotation_clearance();

-- New PostgreSQL functions grant EXECUTE to PUBLIC by default. Keep this
-- trigger helper off the anonymous RPC surface even though it is trigger-only.
revoke all on function public.prevent_untrusted_password_rotation_clearance()
  from public, anon, authenticated;
