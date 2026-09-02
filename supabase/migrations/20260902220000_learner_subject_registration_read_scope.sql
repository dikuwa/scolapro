-- Align learner subject-choice visibility with the existing official-result academic
-- assignment boundary. School management retains school-wide oversight; teachers and
-- class teachers can read only registrations for the exact active subject/class
-- allocation they are responsible for.
--
-- RLS policies execute with caller privileges, so the narrow predicate used directly
-- by the policy is executable by authenticated while the deeper assignment helper it
-- delegates to remains private.

create or replace function app_private.can_read_learner_subject_registration(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_read_official_result(
    p_school_id,
    p_enrolment_id,
    p_subject_offering_id
  );
$$;

revoke all on function app_private.can_read_learner_subject_registration(uuid,uuid,uuid)
from public,anon;
grant execute on function app_private.can_read_learner_subject_registration(uuid,uuid,uuid)
to authenticated;

drop policy if exists "school members can read learner subject registrations"
on public.learner_subject_registrations;

create policy "scoped academic staff read learner subject registrations"
on public.learner_subject_registrations
for select
to authenticated
using (
  app_private.can_read_learner_subject_registration(
    school_id,
    enrolment_id,
    subject_offering_id
  )
);

comment on function app_private.can_read_learner_subject_registration(uuid,uuid,uuid) is
  'Narrow authenticated-executable RLS predicate for learner subject registrations. It delegates to the private official-result assignment boundary: management may read school-wide; teachers/class teachers are limited to the exact active class and subject offering they are allocated to.';