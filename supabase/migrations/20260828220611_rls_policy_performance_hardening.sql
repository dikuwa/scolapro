-- Reduce per-row auth.uid() initialization work and remove avoidable overlapping
-- permissive SELECT policies without changing authorization semantics.

-- user_profiles
drop policy if exists "users can create own profile" on public.user_profiles;
create policy "users can create own profile" on public.user_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile" on public.user_profiles for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile" on public.user_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- school memberships
drop policy if exists "members can read own memberships" on public.school_memberships;
create policy "members can read own memberships" on public.school_memberships for select to authenticated
using (user_id = (select auth.uid()) or app_private.has_school_access(school_id));

-- audit events
drop policy if exists "authenticated members can record scoped audit events" on public.audit_events;
create policy "authenticated members can record scoped audit events" on public.audit_events for insert to authenticated
with check (actor_user_id = (select auth.uid()) and school_id is not null and app_private.has_school_access(school_id));

-- attendance evidence
drop policy if exists "attendance recorders can insert attendance evidence" on public.attendance_evidence;
create policy "attendance recorders can insert attendance evidence" on public.attendance_evidence for insert to authenticated
with check (uploaded_by_user_id = (select auth.uid()) and app_private.can_record_attendance(school_id));
drop policy if exists "uploader or school admin can delete attendance evidence" on public.attendance_evidence;
create policy "uploader or school admin can delete attendance evidence" on public.attendance_evidence for delete to authenticated
using (uploaded_by_user_id = (select auth.uid()) or app_private.can_manage_school_members(school_id));

-- notifications
drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications" on public.notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));
drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications" on public.notifications for update to authenticated
using (recipient_user_id = (select auth.uid())) with check (recipient_user_id = (select auth.uid()));
drop policy if exists "users can delete own notifications" on public.notifications;
create policy "users can delete own notifications" on public.notifications for delete to authenticated
using (recipient_user_id = (select auth.uid()));

-- conduct and achievements
drop policy if exists "teaching staff can create conduct events" on public.conduct_events;
create policy "teaching staff can create conduct events" on public.conduct_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor'])
);
drop policy if exists "teaching staff can create achievements" on public.achievement_events;
create policy "teaching staff can create achievements" on public.achievement_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod','teacher','class_teacher'])
);

-- learner support interventions: preserve restricted read policy, split management
-- into write-only policies so SELECT does not evaluate two equivalent policies.
drop policy if exists "restricted staff can manage support interventions" on public.learner_support_interventions;
create policy "restricted staff can insert support interventions" on public.learner_support_interventions for insert to authenticated
with check (app_private.can_manage_learner_support(school_id) and recorded_by_user_id = (select auth.uid()));
create policy "restricted staff can update support interventions" on public.learner_support_interventions for update to authenticated
using (app_private.can_manage_learner_support(school_id))
with check (app_private.can_manage_learner_support(school_id) and recorded_by_user_id = (select auth.uid()));
create policy "restricted staff can delete support interventions" on public.learner_support_interventions for delete to authenticated
using (app_private.can_manage_learner_support(school_id));

-- communications
drop policy if exists "authorized staff can create school communications" on public.communication_messages;
create policy "authorized staff can create school communications" on public.communication_messages for insert to authenticated
with check (created_by_user_id = (select auth.uid()) and app_private.can_manage_communications(school_id));
drop policy if exists "authors and leaders can update school communications" on public.communication_messages;
create policy "authors and leaders can update school communications" on public.communication_messages for update to authenticated
using (created_by_user_id = (select auth.uid()) or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.can_manage_communications(school_id));

drop policy if exists "message authors can manage communication recipients" on public.communication_recipients;
create policy "message authors can insert communication recipients" on public.communication_recipients for insert to authenticated
with check (exists(
  select 1 from public.communication_messages cm
  where cm.id=message_id and cm.school_id=school_id
    and (cm.created_by_user_id=(select auth.uid()) or app_private.has_school_role(cm.school_id,array['school_admin','principal','deputy_principal']))
));
create policy "message authors can update communication recipients" on public.communication_recipients for update to authenticated
using (exists(
  select 1 from public.communication_messages cm
  where cm.id=message_id and cm.school_id=school_id
    and (cm.created_by_user_id=(select auth.uid()) or app_private.has_school_role(cm.school_id,array['school_admin','principal','deputy_principal']))
))
with check (exists(
  select 1 from public.communication_messages cm
  where cm.id=message_id and cm.school_id=school_id
    and (cm.created_by_user_id=(select auth.uid()) or app_private.has_school_role(cm.school_id,array['school_admin','principal','deputy_principal']))
));
create policy "message authors can delete communication recipients" on public.communication_recipients for delete to authenticated
using (exists(
  select 1 from public.communication_messages cm
  where cm.id=message_id and cm.school_id=school_id
    and (cm.created_by_user_id=(select auth.uid()) or app_private.has_school_role(cm.school_id,array['school_admin','principal','deputy_principal']))
));

-- assessment write paths
drop policy if exists "scoped academic staff can append learner marks" on public.learner_marks;
create policy "scoped academic staff can append learner marks" on public.learner_marks for insert to authenticated
with check (recorded_by_user_id = (select auth.uid()) and app_private.can_access_assessment_instance(assessment_instance_id));
drop policy if exists "scoped academic staff can create mark submissions" on public.mark_submissions;
create policy "scoped academic staff can create mark submissions" on public.mark_submissions for insert to authenticated
with check (submitted_by_user_id = (select auth.uid()) and app_private.can_access_assessment_instance(assessment_instance_id));
drop policy if exists "academic leaders can create official results" on public.official_results;
create policy "academic leaders can create official results" on public.official_results for insert to authenticated
with check (approved_by_user_id = (select auth.uid()) and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod']));

-- statutory certification
drop policy if exists "school leaders can create statutory certifications" on public.statutory_certifications;
create policy "school leaders can create statutory certifications" on public.statutory_certifications for insert to authenticated
with check (certified_by_user_id = (select auth.uid()) and app_private.has_school_role(school_id,array['principal','school_admin']));

-- delegated school duties: split management from read and optimize own-duty lookup.
drop policy if exists "school leaders manage duty assignments" on public.school_duty_assignments;
create policy "school leaders insert duty assignments" on public.school_duty_assignments for insert to authenticated
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "school leaders update duty assignments" on public.school_duty_assignments for update to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "school leaders delete duty assignments" on public.school_duty_assignments for delete to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
drop policy if exists "assignees can read own duties" on public.school_duty_assignments;
create policy "assignees can read own duties" on public.school_duty_assignments for select to authenticated
using (exists(select 1 from public.staff_members sm where sm.id=staff_member_id and sm.user_id=(select auth.uid())));

-- late-arrival policy: split management from read to remove SELECT overlap.
drop policy if exists "school leaders manage late policy" on public.school_late_arrival_policies;
create policy "school leaders insert late policy" on public.school_late_arrival_policies for insert to authenticated
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "school leaders update late policy" on public.school_late_arrival_policies for update to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
create policy "school leaders delete late policy" on public.school_late_arrival_policies for delete to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
