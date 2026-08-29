-- Academic reports are sensitive learner records. Ordinary teachers/class teachers
-- should read report snapshots only for learners they actually teach. Leadership
-- keeps school-wide oversight; HOD remains broad until department ownership is
-- represented in the data model; guardians retain published-only family access.

drop policy if exists "authorized users read report card snapshots" on public.report_card_snapshots;

create policy "scoped users read report card snapshots"
on public.report_card_snapshots
for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])
  or app_private.can_access_learner_observations(school_id,learner_id)
  or (
    status='published'
    and exists (
      select 1
      from public.learner_guardians lg
      join public.guardian_user_links gul on gul.guardian_id=lg.guardian_id
      where lg.learner_id=report_card_snapshots.learner_id
        and lg.effective_from<=current_date
        and (lg.effective_to is null or lg.effective_to>=current_date)
        and gul.user_id=(select auth.uid())
    )
  )
);

comment on policy "scoped users read report card snapshots" on public.report_card_snapshots is
  'Leadership/HOD school oversight, assigned teaching staff for their learners, platform admin, and linked guardians for published reports only.';