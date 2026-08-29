-- One SELECT policy preserves the two existing access paths while avoiding
-- multiple permissive-policy evaluation for authenticated readers.
drop policy if exists "academic staff read report card snapshots" on public.report_card_snapshots;
drop policy if exists "linked guardians read published report cards" on public.report_card_snapshots;

create policy "authorized users read report card snapshots"
on public.report_card_snapshots
for select to authenticated
using (
  app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
  )
  or app_private.has_platform_role(array['platform_admin'])
  or (
    status = 'published'
    and exists (
      select 1
      from public.learner_guardians lg
      join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
      where lg.learner_id = report_card_snapshots.learner_id
        and lg.effective_from <= current_date
        and (lg.effective_to is null or lg.effective_to >= current_date)
        and gul.user_id = (select auth.uid())
    )
  )
);
