-- Guardian identities are longitudinal and may be shared across siblings. Application
-- users must not hard-delete them and cascade away relationship/contact history.

drop policy if exists "school leaders manage guardians [delete]"
  on public.guardian_profiles;

revoke delete on public.guardian_profiles from authenticated;

comment on table public.guardian_profiles is
  'Reusable guardian identity. Authenticated application users may not hard-delete guardian identities; use governed relationship/contact lifecycle changes instead.';
