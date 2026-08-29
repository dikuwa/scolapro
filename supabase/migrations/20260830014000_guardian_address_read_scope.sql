-- Guardian addresses are sensitive family contact data. Align their read boundary
-- with the assignment-aware guardian helper already used by guardian contacts so a
-- class-teacher role does not imply school-wide address visibility.

drop policy if exists "authorized school members read guardian addresses"
  on public.guardian_addresses;

create policy "authorized users read guardian addresses"
on public.guardian_addresses for select to authenticated
using (app_private.can_read_guardian(guardian_id));

comment on policy "authorized users read guardian addresses" on public.guardian_addresses is
  'Guardian address visibility follows the same guardian/self/assigned-learner boundary as contact visibility; class-teacher access is assignment-scoped.';