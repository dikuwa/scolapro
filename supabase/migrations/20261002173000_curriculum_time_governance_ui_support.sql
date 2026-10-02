-- Issue #1012 / Slice 5: platform curriculum-time governance UI support.
-- The UI reuses the existing governed registry. This migration only closes the
-- platform-admin read gap for withdrawn source evidence; mutation/finality
-- remains enforced by the existing registry RLS and triggers.

create policy "platform admins read all curriculum sources"
on public.curriculum_sources
for select
to authenticated
using (app_private.has_platform_role(array['platform_admin']));

comment on policy "platform admins read all curriculum sources"
on public.curriculum_sources is
'Platform administrators may review withdrawn curriculum-source evidence for national policy governance and historical reconstruction. Ordinary authenticated readers remain limited by the existing non-withdrawn source policy.';
