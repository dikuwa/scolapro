-- Remove superseded permissive policies that were created by earlier split-policy
-- migrations. Keeping old broad policies beside newer need-to-know policies weakens
-- the effective RLS boundary because PostgreSQL ORs permissive policies together.

-- Communications: draft recipient mutation is deliberately separate from reading the
-- message/recipient ledger. Avoid an ALL policy because it also becomes a SELECT path.
drop policy if exists "message authors can insert communication recipients" on public.communication_recipients;
drop policy if exists "message authors can update communication recipients" on public.communication_recipients;
drop policy if exists "message authors can delete communication recipients" on public.communication_recipients;
drop policy if exists "message authors manage draft recipients" on public.communication_recipients;

create policy "message authors insert draft recipients"
on public.communication_recipients for insert to authenticated
with check (
  exists (
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists (
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
);

create policy "message authors update draft recipients"
on public.communication_recipients for update to authenticated
using (
  exists (
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists (
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
)
with check (
  exists (
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists (
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
);

create policy "message authors delete draft recipients"
on public.communication_recipients for delete to authenticated
using (
  exists (
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists (
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
);

-- Guardian absence material: owner and reviewer access are both legitimate, but a
-- single policy makes the complete read rule explicit and avoids duplicate evaluation.
drop policy if exists "guardians read own absence notices" on public.guardian_absence_notices;
drop policy if exists "authorized reviewers read learner absence notices" on public.guardian_absence_notices;
create policy "owners and authorized reviewers read absence notices"
on public.guardian_absence_notices for select to authenticated
using (
  submitted_by_user_id=(select auth.uid())
  or app_private.can_review_guardian_absence_notice(id)
);

drop policy if exists "guardians read own absence attachments" on public.guardian_absence_notice_attachments;
drop policy if exists "authorized reviewers read learner absence attachments" on public.guardian_absence_notice_attachments;
create policy "owners and authorized reviewers read absence attachments"
on public.guardian_absence_notice_attachments for select to authenticated
using (
  exists (
    select 1 from public.guardian_absence_notices n
    where n.id=guardian_absence_notice_attachments.notice_id
      and n.submitted_by_user_id=(select auth.uid())
  )
  or app_private.can_review_guardian_absence_notice(notice_id)
);

-- Learner support: remove the legacy broad manage policies. Newer policies are
-- sensitivity-aware; interventions are append-only and support cases are not deletable.
drop policy if exists "restricted staff can manage learner support cases [insert]" on public.learner_support_cases;
drop policy if exists "restricted staff can manage learner support cases [update]" on public.learner_support_cases;
drop policy if exists "restricted staff can manage learner support cases [delete]" on public.learner_support_cases;
drop policy if exists "restricted staff can insert support interventions" on public.learner_support_interventions;
drop policy if exists "restricted staff can update support interventions" on public.learner_support_interventions;
drop policy if exists "restricted staff can delete support interventions" on public.learner_support_interventions;

revoke delete on public.learner_support_cases from authenticated;
revoke update,delete on public.learner_support_interventions from authenticated;
