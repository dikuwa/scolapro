-- A guardian identity is reused across learner relationships and may own contacts,
-- addresses and portal links. Application-level hard deletion would cascade through
-- that longitudinal family history. Keep destructive tenant/reset operations as a
-- database-owner concern, but remove hard-delete authority from authenticated users.

drop policy if exists "school leaders manage guardians [delete]"
  on public.guardian_profiles;

revoke delete on public.guardian_profiles from authenticated;

comment on table public.guardian_profiles is
  'Reusable guardian identity. Authenticated application users may not hard-delete guardian identities because deletion cascades through longitudinal learner relationships and contact history; use governed relationship/contact lifecycle changes instead.';