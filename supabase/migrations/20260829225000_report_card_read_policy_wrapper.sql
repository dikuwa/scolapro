-- RLS policies execute with caller privileges. Keep the deeper assignment helper
-- private and expose one narrow security-definer predicate specifically for report reads.

create or replace function app_private.can_read_report_card_snapshot(
  p_school_id uuid,
  p_learner_id uuid,
  p_status text
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod'])
    or app_private.can_access_learner_observations(p_school_id,p_learner_id)
    or (
      p_status='published'
      and exists (
        select 1
        from public.learner_guardians lg
        join public.guardian_user_links gul on gul.guardian_id=lg.guardian_id
        where lg.learner_id=p_learner_id
          and lg.effective_from<=current_date
          and (lg.effective_to is null or lg.effective_to>=current_date)
          and gul.user_id=(select auth.uid())
      )
    );
$$;

revoke all on function app_private.can_read_report_card_snapshot(uuid,uuid,text) from public,anon;
grant execute on function app_private.can_read_report_card_snapshot(uuid,uuid,text) to authenticated;

drop policy if exists "scoped users read report card snapshots" on public.report_card_snapshots;
create policy "scoped users read report card snapshots"
on public.report_card_snapshots
for select to authenticated
using (app_private.can_read_report_card_snapshot(school_id,learner_id,status));

comment on function app_private.can_read_report_card_snapshot(uuid,uuid,text) is
  'Narrow executable RLS predicate for report-card reads; deeper assignment helpers remain non-public.';