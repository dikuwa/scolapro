-- Explicitly harden the learner-registration RPC against anonymous execution.
-- The function remains SECURITY DEFINER because it performs one atomic governed
-- workflow, but it performs its own school-admin authorization before writes.

revoke all on function public.create_learner_enrolment(
  uuid, integer, uuid, uuid, text, text, text, date, text, text, date
) from public;

revoke all on function public.create_learner_enrolment(
  uuid, integer, uuid, uuid, text, text, text, date, text, text, date
) from anon;

revoke all on function public.create_learner_enrolment(
  uuid, integer, uuid, uuid, text, text, text, date, text, text, date
) from authenticated;

grant execute on function public.create_learner_enrolment(
  uuid, integer, uuid, uuid, text, text, text, date, text, text, date
) to authenticated;

comment on function public.create_learner_enrolment is
  'Authenticated-only atomic learner registration. The function validates school_admin membership before any write.';
