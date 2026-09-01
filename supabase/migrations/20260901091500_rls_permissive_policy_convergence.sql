-- Remove duplicate permissive SELECT evaluation caused by ALL policies while
-- preserving the exact read/write authorization union that existed before.

-- Detention supervision preferences: school members already cover leader reads.
drop policy if exists "school leaders manage detention supervision preferences"
  on public.detention_supervision_preferences;

create policy "school leaders insert detention supervision preferences"
  on public.detention_supervision_preferences
  for insert to authenticated
  with check (app_private.has_school_role(school_id, array['school_admin'::text, 'principal'::text, 'deputy_principal'::text]));

create policy "school leaders update detention supervision preferences"
  on public.detention_supervision_preferences
  for update to authenticated
  using (app_private.has_school_role(school_id, array['school_admin'::text, 'principal'::text, 'deputy_principal'::text]))
  with check (app_private.has_school_role(school_id, array['school_admin'::text, 'principal'::text, 'deputy_principal'::text]));

create policy "school leaders delete detention supervision preferences"
  on public.detention_supervision_preferences
  for delete to authenticated
  using (app_private.has_school_role(school_id, array['school_admin'::text, 'principal'::text, 'deputy_principal'::text]));

-- Sensitive CRC health records: the prior ALL and SELECT policies had the same
-- read predicate. Keep the dedicated read policy and split management by action.
drop policy if exists "need to know staff manage health history"
  on public.learner_health_history;

create policy "need to know staff insert health history"
  on public.learner_health_history
  for insert to authenticated
  with check (
    app_private.can_access_sensitive_crc(school_id, sensitivity)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "need to know staff update health history"
  on public.learner_health_history
  for update to authenticated
  using (app_private.can_access_sensitive_crc(school_id, sensitivity))
  with check (
    app_private.can_access_sensitive_crc(school_id, sensitivity)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "need to know staff delete health history"
  on public.learner_health_history
  for delete to authenticated
  using (app_private.can_access_sensitive_crc(school_id, sensitivity));

-- Prior-school history had two distinct read audiences. Preserve their former
-- permissive OR semantics in one SELECT policy, then split leader writes.
drop policy if exists "enrolment leaders manage prior school history"
  on public.learner_prior_school_history;
drop policy if exists "assigned staff read prior school history"
  on public.learner_prior_school_history;

create policy "authorised staff read prior school history"
  on public.learner_prior_school_history
  for select to authenticated
  using (
    app_private.can_access_crc_observation(school_id, learner_id)
    or app_private.can_manage_enrolment_workflow(school_id)
  );

create policy "enrolment leaders insert prior school history"
  on public.learner_prior_school_history
  for insert to authenticated
  with check (
    app_private.can_manage_enrolment_workflow(school_id)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "enrolment leaders update prior school history"
  on public.learner_prior_school_history
  for update to authenticated
  using (app_private.can_manage_enrolment_workflow(school_id))
  with check (
    app_private.can_manage_enrolment_workflow(school_id)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "enrolment leaders delete prior school history"
  on public.learner_prior_school_history
  for delete to authenticated
  using (app_private.can_manage_enrolment_workflow(school_id));

-- Psychometric records mirror the health-history sensitive access boundary.
drop policy if exists "need to know staff manage psychometric records"
  on public.learner_psychometric_records;

create policy "need to know staff insert psychometric records"
  on public.learner_psychometric_records
  for insert to authenticated
  with check (
    app_private.can_access_sensitive_crc(school_id, sensitivity)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "need to know staff update psychometric records"
  on public.learner_psychometric_records
  for update to authenticated
  using (app_private.can_access_sensitive_crc(school_id, sensitivity))
  with check (
    app_private.can_access_sensitive_crc(school_id, sensitivity)
    and recorded_by_user_id = (select auth.uid())
  );

create policy "need to know staff delete psychometric records"
  on public.learner_psychometric_records
  for delete to authenticated
  using (app_private.can_access_sensitive_crc(school_id, sensitivity));
